require("dotenv").config();
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const geoip = require("geoip-lite");
const useragent = require("express-useragent");

const app = express();

// === TELEGRAM BOT CONFIGURATION ===
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const activeUsers = new Set();

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  activeUsers.add(chatId);
  bot.sendMessage(
    chatId,
    "Бот активирован! Вы будете получать уведомления о новых расчетах."
  );
});

// === SERVER CONFIGURATION ===
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS.split(","),
    methods: ["GET", "POST"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());
app.use(useragent.express());

// === GOOGLE SHEETS CONFIGURATION ===
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

// === CONFIGURATION ===
const SHEET_MAPPING = {
  value1: 'I2',
  value2: 'J2',
  value3: 'H2',
};

// Конфигурация для отображения значений из конкретных ячеек
const DISPLAY_CELLS = [
  { cell: 'A3', valueCell: 'B3' },  // Название и значение
  { cell: 'A4', valueCell: 'B4' },
  { cell: 'A5', valueCell: 'B5' },
  // Добавьте другие ячейки по необходимости
];

// === UTILITY FUNCTIONS ===
function getUserInfo(req) {
  const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const geo = geoip.lookup(ip);
  const browser = req.useragent;

  return {
    ip,
    location: geo
      ? {
          country: geo.country,
          city: geo.city,
          timezone: geo.timezone,
        }
      : "Unknown",
    browser: {
      browser: browser.browser,
      version: browser.version,
      os: browser.os,
      platform: browser.platform,
      isMobile: browser.isMobile,
    },
    timestamp: new Date().toLocaleString("ru-RU"),
    referrer: req.headers.referer || "Direct",
  };
}

async function sendToAllUsers(userInfo, formData, pdfBuffer) {
  try {
    const message = formData
      ? `🔔 Новый расчет!\n\n📊 Размеры:\n• ${formData.value1} x ${formData.value2} x ${formData.value3}\n\n👤 Пользователь:\n• ${userInfo.location.city}, ${userInfo.location.country}\n• ${userInfo.browser.browser} ${userInfo.browser.os}\n• ${userInfo.timestamp}`
      : `🔔 Скачивание PDF\n\n👤 Пользователь:\n• ${userInfo.location.city}, ${userInfo.location.country}\n• ${userInfo.browser.browser} ${userInfo.browser.os}\n• ${userInfo.timestamp}`;

    for (const chatId of activeUsers) {
      try {
        await bot.sendMessage(chatId, message);
        if (pdfBuffer) {
          await bot.sendDocument(chatId, pdfBuffer, {
            filename: `Расчет_${new Date().toISOString()}.pdf`,
          });
        }
      } catch (error) {
        if (error.response?.statusCode === 403) activeUsers.delete(chatId);
      }
    }
  } catch (error) {
    console.error("Ошибка отправки:", error);
  }
}

async function generatePdfUrl(spreadsheetId) {
  return (
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
    new URLSearchParams({
      format: "pdf",
      size: "A4",
      portrait: "true",
      fitw: "true",
      gridlines: "false",
      printtitle: "false",
      sheetnames: "false",
      pagenum: "false",
      scale: "4",
      fzr: "true",
    }).toString()
  );
}

async function downloadWithRetry(downloadUrl, token, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios({
        method: "get",
        url: downloadUrl,
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/pdf",
        },
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      console.error(
        `Попытка ${attempt} загрузки PDF не удалась:`,
        error.message
      );
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function updateSheetCell(sheets, value, cell) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!${cell}`,
      valueInputOption: "RAW",
      resource: {
        values: [[value]],
      },
    });
  } catch (error) {
    console.error(`Ошибка обновления ячейки ${cell}:`, error);
    throw error;
  }
}

// === ROUTES ===
app.post("/update-sheet", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const updatePromises = [];

    // Обновляем каждое значение в соответствующей ячейке
    for (const [key, value] of Object.entries(req.body)) {
      if (SHEET_MAPPING[key]) {
        updatePromises.push(updateSheetCell(sheets, value, SHEET_MAPPING[key]));
      }
    }

    // Ждем завершения всех обновлений
    await Promise.all(updatePromises);

    // Отправляем уведомление в Telegram
    await sendToAllUsers(getUserInfo(req), req.body);

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка обновления таблицы:", error);
    res.status(500).json({
      error: "Ошибка обновления таблицы",
      details: error.message,
    });
  }
});

app.get("/download-file", async (req, res) => {
  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    const downloadUrl = await generatePdfUrl(spreadsheetId);

    const pdfBuffer = await downloadWithRetry(downloadUrl, token);

    const userInfo = getUserInfo(req);

    await sendToAllUsers(userInfo, null, pdfBuffer);

    const fileName = `Расчет_${new Date()
      .toLocaleDateString("ru-RU")
      .replace(/\./g, "-")}.pdf`;
    const encodedFileName = encodeURIComponent(fileName);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Ошибка при скачивании файла:", error);
    res.status(500).json({
      error: "Ошибка при скачивании файла",
      details: error.message,
    });
  }
});

// Обновляем endpoint получения данных
app.get("/get-sheet-data", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const data = {
      values: {}, 
      displayLines: [], 
    };

    // Получаем значения для формы
    for (const [key, cell] of Object.entries(SHEET_MAPPING)) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Sheet1!${cell}`,
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      data.values[key] = response.data.values?.[0]?.[0] || "";
    }

    // Получаем значения из указанных ячеек
    for (const { cell, valueCell } of DISPLAY_CELLS) {
      const nameResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Sheet1!${cell}`,
        valueRenderOption: "FORMATTED_VALUE",
      });

      const valueResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Sheet1!${valueCell}`,
        valueRenderOption: "FORMATTED_VALUE",
      });

      const name = nameResponse.data.values?.[0]?.[0];
      const value = valueResponse.data.values?.[0]?.[0];

      if (name && value) {
        data.displayLines.push({
          text: `${name}: ${value}`
        });
      }
    }

    res.json(data);
  } catch (error) {
    console.error("Ошибка при получении данных таблицы:", error);
    res.status(500).json({
      error: "Ошибка при получении данных таблицы",
      details: error.message
    });
  }
});

// === SERVER START ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
