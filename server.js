/* ──────────────────────────────────────────────────────────────────────────
 *  server.js   (Node ≥ 16)
 *  npm i express googleapis cors axios node-telegram-bot-api geoip-lite express-useragent dotenv puppeteer handlebars
 * ────────────────────────────────────────────────────────────────────────── */

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
const Handlebars = require("handlebars");
const html_to_pdf = require("html-pdf-node");

const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>ENEL - Расчет стоимости</title>
    <style>
      @font-face {
        font-family: "Inter";
        src: url("fonts/Inter-Regular.ttf") format("truetype");
      }

      body {
        font-family: "Inter", Arial, sans-serif;
        margin: 0;
        color: #202737;
        background: url("https://static.tildacdn.com/tild3134-3631-4332-b537-356336333531/bgim_1.png") no-repeat top center;
        background-size: contain;
        padding: 40px;
        box-sizing: border-box;
        background-color: #EDEEF1;
      }
      .header-container {
        max-width: 1400px;
        margin: 0 auto;
        padding-top: 10px;
      }
      .main-container {
        border-radius: 20px;
        border: 1px solid #bdbdbd;
        padding: 40px 20px;
        background: #ffffff;
        max-width: 1400px;
        margin: 0 auto;
      }

      .header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 40px;
      }

      .logo {
        font-size: 46px;
        font-weight: bold;
      }

      .company-info {
        text-align: right;
        font-size: 13px;
        color: #0d0d0d;
        font-weight: 600;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: rgba(255, 255, 255, 0.5);
        padding: 10px;
        border-radius: 10px;
        backdrop-filter: blur(10px);
      }

      .subtitle {
        font-size: 17px;
        color: #000000;
        margin-top: 8px;
      }

      table {
        width: 100%;
        margin: 16px auto;
        background: #fff;
        border-collapse: collapse;
        border-spacing: 0;
        overflow: hidden;
      }

      thead th {
        background: none;
        font-weight: 600;
        color: #202737;
        font-size: 15px;
        text-align: left;
        border: none;
        padding: 18px 12px 12px 12px;
      }

      th,
      td {
        padding: 8px 12px;
        border: none;
        background: none;
      }

      thead {
        border-bottom: 1px solid rgba(197, 197, 197, 0.5);
      }

      tbody tr {
        border: none;
        background: none;
        border-bottom: 1px solid rgba(197, 197, 197, 0.5);
      }
      tr > td {
        border-right: 1px solid rgba(197, 197, 197, 0.5);
      }

      th.col-qty,
      th.col-unit,
      th.col-price,
      th.col-total,
      td.col-qty,
      td.col-unit,
      td.col-price,
      td.col-total {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .section-title {
        display: none;
        font-size: 16px;
        font-weight: bold;
        margin: 30px 0 10px 0;
        color: #202737;
        background: #f3f6fa;
        padding: 8px 12px;
        border-left: 4px solid #4a90e2;
      }

      .subsection-title {
        font-size: 16px;
        font-weight: bold;
        color: #4a4a4a;
        background: #f9f9f9;
        padding: 6px 8px;
        border-bottom: 1.5px solid #b5c9e2;
      }

      .highlight-yellow {
        background: #fff7c0 !important;
      }

      .total-row,
      .grand-total {
        font-weight: bold;
        color: #202737;
        background: #f7fafd;
        border-top: none;
        text-align: right;
        border-radius: 0 0 18px 18px;
        box-shadow: none;
        padding: 16px 12px;
      }

      .grand-total {
        font-size: 20px;
        margin-top: 24px;
        padding: 18px 0;
        background: #f3f6fa;
        border-radius: 0 0 18px 18px;
        padding-right: 12px;
      }

      tr.section-divider td {
        border-bottom: none;
        height: 8px;
        background: #fff;
      }
    </style>
  </head>
  <body>
    <div class="header-container">
      <div class="header">
        <div>
          <div class="logo">ENEL</div>
          <div class="subtitle">Строительство загородных </br> домов</div>
        </div>
        <div class="company-info">
          <div>Расчётный счёт: 40802810020000387233</div>
          <div>Название банка: ООО "Банк Точка"</div>
          <div>БИК: 044525104</div>
          <div>Корреспондентский счёт: 30101810745374525104</div>
          <div>Наименование: ИП Леонов Никита Евгеньевич</div>
          <div>ИНН: 682016289371</div>
        </div>
      </div>
    </div>

    <div class="main-container">
      <div class="section-title">Материал</div>
      <table>
        <thead>
          <tr>
            <th class="col-name">Материал</th>
            <th class="col-qty">Кол-во</th>
            <th class="col-unit">Ед. изм.</th>
            <th class="col-price">Цена</th>
            <th class="col-total">Итого</th>
          </tr>
        </thead>
        <tbody>
          {{#each materials}}
          <tr class="trr">
            <td>{{name}}</td>
            <td class="col-qty">{{quantityFormatted}}</td>
            <td class="col-unit">{{unit}}</td>
            <td class="col-price">{{priceFormatted}}</td>
            <td class="col-total">{{totalFormatted}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
      <div class="total-row">Итого материал: {{materialsTotalFormatted}}</div>

      <div class="section-title">Расходники</div>
      <table>
        <thead>
          <tr>
            <th class="col-name">Расходники</th>
            <th class="col-qty">Кол-во</th>
            <th class="col-unit">Ед. изм.</th>
            <th class="col-price">Цена</th>
            <th class="col-total">Итого</th>
          </tr>
        </thead>
        <tbody>
          {{#each consumables}}
          <tr>
            <td>{{name}}</td>
            <td class="col-qty">{{quantityFormatted}}</td>
            <td class="col-unit">{{unit}}</td>
            <td class="col-price">{{priceFormatted}}</td>
            <td class="col-total">{{totalFormatted}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
      <div class="total-row">Итого расходники: {{consumablesTotalFormatted}}</div>

      <div class="section-title">Техника</div>
      <table>
        <thead>
          <tr>
            <th class="col-name">Техника</th>
            <th class="col-qty">Кол-во</th>
            <th class="col-unit">Ед. изм.</th>
            <th class="col-price">Цена</th>
            <th class="col-total">Итого</th>
          </tr>
        </thead>
        <tbody>
          {{#each equipment}}
          <tr>
            <td>{{name}}</td>
            <td class="col-qty">{{quantityFormatted}}</td>
            <td class="col-unit">{{unit}}</td>
            <td class="col-price">{{priceFormatted}}</td>
            <td class="col-total">{{totalFormatted}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
      <div class="total-row">Итого техника: {{equipmentTotalFormatted}}</div>

      <div class="section-title">Работа</div>
      <table>
        <thead>
          <tr>
            <th class="col-name">Работа</th>
            <th class="col-qty">Кол-во</th>
            <th class="col-unit">Ед. изм.</th>
            <th class="col-price">Цена</th>
            <th class="col-total">Итого</th>
          </tr>
        </thead>
        <tbody>
          {{#each labor}}
          <tr>
            <td>{{name}}</td>
            <td class="col-qty">{{quantityFormatted}}</td>
            <td class="col-unit">{{unit}}</td>
            <td class="col-price">{{priceFormatted}}</td>
            <td class="col-total">{{totalFormatted}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
      <div class="total-row">Итого работы: {{laborTotalFormatted}}</div>

      <div class="grand-total">Всего: {{grandTotalFormatted}}</div>
    </div>
  </body>
</html>`;

const app = express();

/* ─────────────── 1.  CORS ─────────────────────────────────────────────── */

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:8888",
  "http://localhost:8888",
  "http://localhost:3000",
  "http://localhost:3050",
  "https://enel-spb.ru",
  "http://enel-spb.ru",
  "https://housespb.tilda.ws",
  "http://housespb.tilda.ws",
  "https://api.enel-spb.ru",
  "http://api.enel-spb.ru",
  "https://api.farvix.shop",
  "http://enelspbapi.craftlify.ru",
  "https://enelspbapi.craftlify.ru",
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      console.log("Blocked origin:", origin);
      cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

/* ─────────────── 2.  Общие middleware ─────────────────────────────────── */

app.use(express.json());
app.use(useragent.express());

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url}  ←  ${
      req.headers.origin || "—"
    }`
  );
  next();
});

/* ─────────────── 3.  Telegram-бот ─────────────────────────────────────── */

const CHAT_IDS_FILE = path.join(__dirname, "chat_ids.json");

async function loadChatIds() {
  try {
    const d = await fs.readFile(CHAT_IDS_FILE, "utf8");
    return new Set(JSON.parse(d));
  } catch {
    await fs.writeFile(CHAT_IDS_FILE, "[]");
    return new Set();
  }
}
async function saveChatIds(set) {
  await fs.writeFile(CHAT_IDS_FILE, JSON.stringify([...set]));
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
let activeUsers = new Set();

(async () => {
  activeUsers = await loadChatIds();
  console.log("Активные Telegram-пользователи:", [...activeUsers]);
})();

bot.onText(/\/start/, async (m) => {
  if (!activeUsers.has(m.chat.id)) {
    activeUsers.add(m.chat.id);
    await saveChatIds(activeUsers);
    bot.sendMessage(m.chat.id, "Бот активирован!");
  }
});
bot.onText(/\/stop/, async (m) => {
  activeUsers.delete(m.chat.id);
  await saveChatIds(activeUsers);
  bot.sendMessage(m.chat.id, "Уведомления отключены");
});
bot.onText(/\/status/, async (m) => {
  bot.sendMessage(
    m.chat.id,
    activeUsers.has(m.chat.id)
      ? "Уведомления включены"
      : "Уведомления отключены"
  );
});

/* ─────────────── 4.  Google Sheets ────────────────────────────────────── */

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const TABLE_RANGE = "Sheet1!B1:F50"; //  ⬅️  Диапазон под front-end

/* ─────────────── 5.  Хелперы ──────────────────────────────────────────── */

function getUserInfo(req) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip);
  const ua = req.useragent;
  return {
    ip,
    location: geo
      ? { country: geo.country, city: geo.city, timezone: geo.timezone }
      : "Unknown",
    browser: {
      browser: ua.browser,
      version: ua.version,
      os: ua.os,
      platform: ua.platform,
      isMobile: ua.isMobile,
    },
    timestamp: new Date().toLocaleString("ru-RU"),
  };
}

async function sendToAllUsers(userInfo, formData, pdfBuffer) {
  if (!activeUsers.size) return;
  let text = "🔔 *Новая активность на сайте*\n\n";
  if (formData) {
    text += `📊 *Данные формы*\nДлина: ${formData.value1}\nШирина: ${formData.value2}\nТолщина: ${formData.value3}\n\n`;
  }
  text += `👤 *Пользователь*\nБраузер: ${userInfo.browser.browser} ${userInfo.browser.version}\nВремя: ${userInfo.timestamp}`;
  for (const id of activeUsers) {
    try {
      await bot.sendMessage(id, text, { parse_mode: "Markdown" });
      if (pdfBuffer) {
        await bot.sendDocument(
          id,
          Buffer.from(pdfBuffer),
          {
            filename: `Расчёт_${new Date().toISOString().slice(0, 10)}.pdf`,
            contentType: "application/pdf",
          },
          { caption: "Подробный расчёт" }
        );
      }
    } catch (e) {
      console.error("TG error", e.message);
      if (e.response?.statusCode === 403) {
        activeUsers.delete(id);
        await saveChatIds(activeUsers);
      }
    }
  }
}

/* ─────────────── 6.  Существующие энд-пойнты (update-sheet, download-file) ─ */

const SHEET_MAPPING = { value1: "J2", value2: "K2", value3: "I2" };

app.post("/update-sheet", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const tasks = Object.entries(req.body)
      .filter(([k]) => SHEET_MAPPING[k])
      .map(([k, v]) =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!${SHEET_MAPPING[k]}`,
          valueInputOption: "RAW",
          resource: { values: [[v]] },
        })
      );
    await Promise.all(tasks);
    await sendToAllUsers(getUserInfo(req), req.body);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка обновления", details: e.message });
  }
});

// Добавить функцию для генерации PDF из HTML
async function generateCustomPdf(data) {
  try {
    console.log(
      "Starting PDF generation with data:",
      JSON.stringify(data, null, 2)
    );

    // Компилируем шаблон
    const template = Handlebars.compile(HTML_TEMPLATE);

    // Заполняем данными
    const html = template(data);
    console.log("HTML generated successfully");

    // Настройки для PDF
    const options = {
      width: "1040px",
      height: "2350px",
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
      printBackground: true,
      preferCSSPageSize: true,
    };

    // Генерируем PDF
    const file = { content: html };
    const pdf = await html_to_pdf.generatePdf(file, options);
    console.log("PDF generated successfully");

    return pdf;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}

// Функция для форматирования чисел в русском стиле
function formatNumber(num) {
  return new Intl.NumberFormat("ru-RU").format(num);
}

// Обновить функцию обработки данных из Google Sheets
function processSheetData(data) {
  const [headers, ...rows] = data.values || [[], []];

  let currentSection = "materials";
  const result = {
    // Данные компании
    bankAccount: "40802810000000187332",
    bankName: 'ООО "Банк Точка"',
    bik: "044525104",
    corrAccount: "30101810745374525104",
    companyName: "ИП Денисов Никита Евгеньевич",
    inn: "682016289371",

    // Секции данных
    materials: [],
    consumables: [],
    equipment: [],
    labor: [],

    // Итоги
    materialsTotal: 0,
    consumablesTotal: 0,
    equipmentTotal: 0,
    laborTotal: 0,
    grandTotal: 0,
  };

  // Функция для преобразования строки в число с учетом запятых
  function parseNumber(str) {
    if (!str) return 0;
    // Заменяем запятые на точки и удаляем пробелы
    const numStr = String(str).replace(/,/g, ".").replace(/\s/g, "");
    return parseFloat(numStr) || 0;
  }

  // Обрабатываем строки данных
  rows.forEach((row) => {
    // Пропускаем полностью пустые строки
    if (!row || row.every((cell) => !cell || String(cell).trim() === ""))
      return;

    // Определяем секцию по названию (если явно указано в первой ячейке)
    if (row[0] && typeof row[0] === "string") {
      const lower = row[0].toLowerCase().trim();
      console.log(`lower: ${lower}`);
      if (lower === "расходники" || lower === "расходники:") {
        currentSection = "consumables";
        return;
      } else if (lower === "техника" || lower === "техника:") {
        currentSection = "equipment";
        return;
      } else if (
        lower === "работа" ||
        lower === "работа:" ||
        lower === "строй работа:" ||
        lower === "работы" ||
        lower === "работы:"
      ) {
        currentSection = "labor";
        return;
      }
    }

    // Добавляем данные в текущую секцию с округлением и форматированием числовых значений
    // Если строка не содержит числовых данных (например, это подзаголовок или текст), всё равно добавляем как есть
    const quantity = parseNumber(row[1]);
    const price = parseNumber(row[3]);
    const total = parseNumber(row[4]);

    const item = {
      name: row[0] ? String(row[0]).trim() : "",
      quantity: isNaN(quantity) ? "" : Math.round(quantity),
      quantityFormatted: isNaN(quantity)
        ? ""
        : formatNumber(Math.round(quantity)),
      unit: row[2] || "",
      price: isNaN(price) ? "" : Math.round(price),
      priceFormatted: isNaN(price) ? "" : formatNumber(Math.round(price)),
      total: isNaN(total) ? "" : Math.round(total),
      totalFormatted: isNaN(total) ? "" : formatNumber(Math.round(total)),
    };

    // Добавляем только если есть хотя бы одно ключевое значение
    if (item.name && item.quantity && item.price && item.total) {
      result[currentSection].push(item);
    }
  });

  // Подсчитываем итоги для каждой секции с округлением и форматированием
  const materialsTotal = Math.round(
    result.materials.reduce((sum, item) => sum + (item.total || 0), 0)
  );
  const consumablesTotal = Math.round(
    result.consumables.reduce((sum, item) => sum + (item.total || 0), 0)
  );
  const equipmentTotal = Math.round(
    result.equipment.reduce((sum, item) => sum + (item.total || 0), 0)
  );
  const laborTotal = Math.round(
    result.labor.reduce((sum, item) => sum + (item.total || 0), 0)
  );

  result.materialsTotal = materialsTotal;
  result.materialsTotalFormatted = formatNumber(materialsTotal);
  result.consumablesTotal = consumablesTotal;
  result.consumablesTotalFormatted = formatNumber(consumablesTotal);
  result.equipmentTotal = equipmentTotal;
  result.equipmentTotalFormatted = formatNumber(equipmentTotal);
  result.laborTotal = laborTotal;
  result.laborTotalFormatted = formatNumber(laborTotal);

  // Берем общий итог из ячейки F50 и округляем
  if (rows[48] && rows[48][4] !== undefined) {
    const f50Value = String(rows[48][4]).replace(/,/g, ".").replace(/\s/g, "");
    result.grandTotal = Math.round(parseFloat(f50Value)) || 0;
    result.grandTotalFormatted = formatNumber(result.grandTotal);
  }

  return result;
}

// Обновить endpoint для скачивания файла
app.get("/download-file", async (req, res) => {
  try {
    console.log("Starting download-file request");

    // 1. Получаем данные из Google Sheets
    const sheets = google.sheets({ version: "v4", auth });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: TABLE_RANGE,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    console.log("Data received from Google Sheets");

    // 2. Обрабатываем данные
    const processedData = processSheetData(data);
    console.log("Data processed:", JSON.stringify(processedData, null, 2));

    // 3. Генерируем PDF
    const pdf = await generateCustomPdf(processedData);
    console.log("PDF generated successfully");

    // 4. Отправляем PDF
    const name = `enel-spb.ru_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(pdf);
  } catch (e) {
    console.error("Download error:", e);
    res.status(500).json({
      error: "Ошибка скачивания",
      details: e.message,
      stack: e.stack,
    });
  }
});

/* ─────────────── 7.  НОВЫЙ энд-пойнт для front-end-HTML ───────────────── */

app.get("/get-sheet-table", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: TABLE_RANGE,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const [headers, ...rows] = data.values || [];
    res.json({ headers, rows });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: "Не могу получить таблицу", details: e.message });
  }
});

app.get("/get-sheet-data", async (req, res) => {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: TABLE_RANGE,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    // Обрабатываем данные
    const processedData = processSheetData(data);

    res.json({
      success: true,
      values: processedData,
      displayLines:
        data.values?.map((row) => ({
          text: row.join(" - "),
        })) || [],
      totalPrice: processedData.grandTotal,
    });
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .json({ error: "Ошибка получения данных", details: e.message });
  }
});

/* ─────────────── 8.  Запуск ────────────────────────────────────────────── */

const PORT = process.env.PORT || 3050;
app.listen(PORT, () => console.log(`⚡  Server running on port ${PORT}`));
