require("dotenv").config();
const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const geoip = require("geoip-lite");
const useragent = require("express-useragent");
const fs = require("fs").promises;
const path = require("path");

const app = express();

// Настройка CORS до всех остальных middleware и маршрутов
const allowedOrigins = [
  "http://127.0.0.1:8888",
  "http://localhost:8888",
  "http://localhost:3000",
  "https://enel-spb.ru",
  "http://enel-spb.ru",
  "https://housespb.tilda.ws",
  "http://housespb.tilda.ws",
  "http://api.enel-spb.ru",
  "https://api.enel-spb.ru",
];

// Конфигурация CORS
app.use(
  cors({
    origin: function (origin, callback) {
      // Разрешаем запросы без origin (например, от Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log("Blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Добавляем дополнительные заголовки
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Логирование всех запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  console.log("Origin:", req.headers.origin);
  next();
});

app.use(express.json());
app.use(useragent.express());

// === TELEGRAM BOT CONFIGURATION ===
const CHAT_IDS_FILE = path.join(__dirname, "chat_ids.json");

// Функция для загрузки chat ID из файла
async function loadChatIds() {
  try {
    const data = await fs.readFile(CHAT_IDS_FILE, "utf8");
    return new Set(JSON.parse(data));
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(CHAT_IDS_FILE, "[]");
      return new Set();
    }
    console.error("Ошибка при чтении chat IDs:", error);
    return new Set();
  }
}

// Функция для сохранения chat ID в файл
async function saveChatIds(chatIds) {
  try {
    await fs.writeFile(CHAT_IDS_FILE, JSON.stringify([...chatIds]));
  } catch (error) {
    console.error("Ошибка при сохранении chat IDs:", error);
  }
}

// Инициализация бота и активных пользователей
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
let activeUsers = new Set();

// Загружаем сохраненные chat ID при запуске
(async () => {
  activeUsers = await loadChatIds();
  console.log("Загружены активные пользователи:", [...activeUsers]);
})();

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // Проверяем, не был ли пользователь уже активирован
  if (!activeUsers.has(chatId)) {
    activeUsers.add(chatId);
    await saveChatIds(activeUsers);
    console.log(`Новый пользователь добавлен: ${chatId}`);
    bot.sendMessage(
      chatId,
      "Бот активирован! Вы будете получать уведомления о новых расчетах."
    );
  }
});

// Добавим команду /stop для отключения уведомлений
bot.onText(/\/stop/, async (msg) => {
  const chatId = msg.chat.id;
  if (activeUsers.has(chatId)) {
    activeUsers.delete(chatId);
    await saveChatIds(activeUsers);
    bot.sendMessage(
      chatId,
      "Уведомления отключены. Чтобы включить их снова, используйте команду /start"
    );
  }
});

// Добавим команду /status для проверки статуса
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const status = activeUsers.has(chatId)
    ? "Уведомления включены"
    : "Уведомления отключены. Используйте /start для включения";
  bot.sendMessage(chatId, status);
});

// === SERVER CONFIGURATION ===
app.use(cors());
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
  value1: "J2",
  value2: "K2",
  value3: "I2",
};

// Конфигурация для отображения значений из конкретных ячеек
const DISPLAY_CELLS = [{ cell: "E48", valueCell: "F48" }];

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
    console.log("=== Начало отправки сообщений ===");
    console.log("Активные пользователи:", [...activeUsers]);
    console.log("PDF буфер получен:", !!pdfBuffer);
    if (pdfBuffer) {
      console.log("Размер PDF:", pdfBuffer.length, "байт");
    }

    let message = `🔔 Новая активность на сайте!\n\n`;

    if (formData) {
      message += `📊 Данные формы:
• Длина: ${formData.value1}
• Ширина: ${formData.value2}
• Толщина: ${formData.value3}\n\n`;
    }

    message += `👤 Информация о пользователе:
• Браузер: ${userInfo.browser.browser} ${userInfo.browser.version}
• Время: ${userInfo.timestamp}`;

    for (const chatId of activeUsers) {
      try {
        console.log(`Отправка сообщения пользователю ${chatId}`);
        await bot.sendMessage(chatId, message);
        console.log(`Сообщение отправлено пользователю ${chatId}`);

        if (pdfBuffer) {
          console.log(`Начало отправки PDF пользователю ${chatId}`);
          const buffer = Buffer.from(pdfBuffer);
          console.log(`PDF буфер создан, размер: ${buffer.length}`);

          await bot.sendDocument(
            chatId,
            buffer,
            {
              filename: `Расчет_${new Date().toISOString().slice(0, 10)}.pdf`,
              contentType: "application/pdf",
            },
            {
              caption: "Подробный расчет в формате PDF",
            }
          );
          console.log(`PDF успешно отправлен пользователю ${chatId}`);
        } else {
          console.log("PDF буфер отсутствует, пропускаем отправку файла");
        }
      } catch (error) {
        console.error(`Ошибка отправки пользователю ${chatId}:`, error);
        console.error(
          "Полная информация об ошибке:",
          JSON.stringify(error, null, 2)
        );
        if (error.response?.statusCode === 403) {
          console.log(`Удаление пользователя ${chatId} из-за блокировки`);
          activeUsers.delete(chatId);
          await saveChatIds(activeUsers);
        }
      }
    }
    console.log("=== Завершение отправки сообщений ===");
  } catch (error) {
    console.error("Ошибка массовой рассылки:", error);
    console.error("Стек ошибки:", error.stack);
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
        timeout: 30000, // увеличиваем timeout до 30 секунд
      });

      // Проверяем, что получили PDF
      if (response.headers["content-type"].includes("application/pdf")) {
        console.log(`PDF успешно загружен (попытка ${attempt})`);
        return response.data;
      } else {
        throw new Error("Получен неверный тип контента");
      }
    } catch (error) {
      console.error(
        `Попытка ${attempt} загрузки PDF не удалась:`,
        error.message
      );
      if (attempt === maxRetries) throw error;
      // Увеличиваем время ожидания с каждой попыткой
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
    console.log("=== Начало скачивания файла ===");
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    const downloadUrl = await generatePdfUrl(spreadsheetId);
    const pdfBuffer = await downloadWithRetry(downloadUrl, token);

    const userInfo = getUserInfo(req);
    await sendToAllUsers(userInfo, null, pdfBuffer);

    // Формируем безопасное имя файла
    const date = new Date().toISOString().split("T")[0]; // Получаем формат YYYY-MM-DD
    const fileName = `enel-spb.ru_${date}.pdf`;

    // Устанавливаем заголовки для скачивания
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=" + fileName);
    res.send(pdfBuffer);

    console.log("=== Завершение скачивания файла ===");
  } catch (error) {
    console.error("=== ОШИБКА ПРИ СКАЧИВАНИИ ФАЙЛА ===");
    console.error("Сообщение:", error.message);
    console.error("Стек:", error.stack);
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
          text: `${value} ₽`,
        });
      }
    }

    res.json(data);
  } catch (error) {
    console.error("Ошибка при получении данных таблицы:", error);
    res.status(500).json({
      error: "Ошибка при получении данных таблицы",
      details: error.message,
    });
  }
});

// === SERVER START ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
