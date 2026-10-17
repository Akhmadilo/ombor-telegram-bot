require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { generateDashboardPDF, generateChartScreenshot } = require('./pdfGenerator');

const token = process.env.BOT_TOKEN;
const dashboardUrl = process.env.DASHBOARD_URL || 'https://ombor-dashboard.vercel.app';
const allowedUsers = process.env.ALLOWED_USERS ? process.env.ALLOWED_USERS.split(',').map(id => id.trim()) : [];

if (!token) {
  console.error("BOT_TOKEN is missing in .env");
  process.exit(1);
}

const bot = new TelegramBot(token, {
  polling: {
    autoStart: true,
    params: {
      timeout: 10,
    },
  },
});

// Resilient error handlers so the bot never crashes on network glitches
bot.on('polling_error', (error) => {
  console.warn(`[Telegram Polling Warning] (${new Date().toLocaleTimeString()}):`, error.code || error.message);
});

bot.on('error', (error) => {
  console.error('[Telegram Bot Error]:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err.message);
});

console.log('Ombor Telegram Bot is running...');

// Middleware to check allowed users
const isAllowed = (msg) => {
  const userId = (msg.from ? msg.from.id : msg.chat.id).toString();
  if (allowedUsers.length === 0) return true; // if no allowed users set, allow everyone (for testing)
  return allowedUsers.includes(userId);
};

const mainMenuOptions = {
  reply_markup: JSON.stringify({
    keyboard: [
      [{ text: "📊 Grafiklar (Analytics)" }, { text: "📈 Umumiy Qoldiqlar (Matrix)" }],
      [{ text: "📝 1C Nomenklatura Qoldiqlari" }, { text: "🔄 Tranzaksiyalar Tarixi" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  })
};

const getChartsInlineKeyboard = () => {
  return {
    inline_keyboard: [
      [
        { text: "📈 Sotuv Trendi", callback_data: "chart_daily-sales" },
        { text: "🥧 Qoldiq Taqsimoti", callback_data: "chart_ending-doughnut" }
      ],
      [
        { text: "📊 Kirim vs Chiqim", callback_data: "chart_movement" },
        { text: "⚖️ Boshlang'ich vs Yakuniy", callback_data: "chart_stock-balance" }
      ],
      [
        { text: "💰 Narxlar", callback_data: "chart_avg-prices" },
        { text: "👥 Top Mijozlar", callback_data: "chart_top-clients" }
      ],
      [
        { text: "📉 Sof Harakat", callback_data: "chart_net-move" },
        { text: "🔀 Sof Farq Balansi", callback_data: "chart_net-diff" }
      ],
      [
        { text: "🏆 ABC Tahlili", callback_data: "chart_abc" },
        { text: "🔄 Aylanma Tezligi", callback_data: "chart_turnover" }
      ],
      [
        { text: "📅 Sana Tanlash", callback_data: "date_select" },
        { text: "📋 To'liq Hisobot", callback_data: "full_report" }
      ]
    ]
  };
};

const getDateInlineKeyboard = () => {
  return {
    inline_keyboard: [
      [
        { text: "Oxirgi 7 kun", callback_data: "date_7" },
        { text: "Oxirgi 14 kun", callback_data: "date_14" }
      ],
      [
        { text: "Oxirgi 30 kun", callback_data: "date_30" },
        { text: "Butun davr", callback_data: "date_all" }
      ],
      [
        { text: "⬅️ Orqaga", callback_data: "back_to_charts" }
      ]
    ]
  };
};

// Store selected date range per chat
const userDaysMap = {};

bot.onText(/\/start|\/hisobot/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAllowed(msg)) {
    return bot.sendMessage(chatId, "Kechirasiz, siz ushbu botdan foydalanish huquqiga ega emassiz.");
  }
  
  bot.sendMessage(chatId, "Assalomu alaykum! 📊 Ombor Analitika botiga xush kelibsiz.\n\nQaysi hisobotni yuklab olmoqchisiz? Quyidagi tugmalardan birini tanlang:", mainMenuOptions);
  
  // Show inline keyboard for charts as MAIN interaction
  bot.sendMessage(chatId, "Quyidagi grafiklarni tanlang:", {
    reply_markup: getChartsInlineKeyboard()
  });
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands like /start or /hisobot here
  if (!text || text.startsWith('/')) return;

  if (!isAllowed(msg)) return;

  // If user presses the 'Grafiklar' button from persistent keyboard
  if (text === "📊 Grafiklar (Analytics)") {
    return bot.sendMessage(chatId, "Quyidagi grafiklarni tanlang:", {
      reply_markup: getChartsInlineKeyboard()
    });
  }

  const validOptions = {
    "📈 Umumiy Qoldiqlar (Matrix)": "matrix",
    "📝 1C Nomenklatura Qoldiqlari": "nomenklatura",
    "🔄 Tranzaksiyalar Tarixi": "tranzaksiyalar"
  };

  const tabName = validOptions[text];

  if (tabName) {
    const waitMsg = await bot.sendMessage(chatId, `⏳ Tanlangan hisobot tayyorlanmoqda... (Biroz kuting)`, { reply_markup: mainMenuOptions.reply_markup });

    try {
      const urlToVisit = `${dashboardUrl}?tab=${tabName}&bot=1`;
      const pdfBuffer = await generateDashboardPDF(urlToVisit);
      const nodeBuffer = Buffer.from(pdfBuffer);
      
      let caption = "📊 Ombor Hisoboti";
      if (tabName === 'matrix') caption = "📈 Matrix Jadvali Hisoboti";
      if (tabName === 'nomenklatura') caption = "📝 1C Nomenklatura Qoldiqlari";
      if (tabName === 'tranzaksiyalar') caption = "🔄 Tranzaksiyalar Tarixi";

      await bot.sendDocument(chatId, nodeBuffer, {
        caption: caption,
        reply_markup: mainMenuOptions.reply_markup
      }, {
        filename: `Hisobot_${tabName}_${new Date().toISOString().split('T')[0]}.pdf`,
        contentType: 'application/pdf',
      });

      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    } catch (error) {
      console.error(error);
      bot.sendMessage(chatId, "❌ Xatolik yuz berdi. PDF ni yaratishning iloji bo'lmadi.", { reply_markup: mainMenuOptions.reply_markup });
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    }
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (!isAllowed(query)) {
    return bot.answerCallbackQuery(query.id, { text: "Kechirasiz, siz ushbu botdan foydalanish huquqiga ega emassiz." });
  }

  // Answer callback to prevent loading indicator on the button
  bot.answerCallbackQuery(query.id).catch(() => {});

  if (data === 'date_select') {
    return bot.editMessageReplyMarkup(getDateInlineKeyboard().inline_keyboard, {
      chat_id: chatId,
      message_id: messageId
    }).catch(console.error);
  }

  if (data === 'back_to_charts') {
    return bot.editMessageReplyMarkup(getChartsInlineKeyboard().inline_keyboard, {
      chat_id: chatId,
      message_id: messageId
    }).catch(console.error);
  }

  if (data.startsWith('date_')) {
    const daysStr = data.replace('date_', '');
    let days = 0;
    if (daysStr !== 'all') {
      days = parseInt(daysStr, 10);
    }
    userDaysMap[chatId] = days;
    
    await bot.sendMessage(chatId, `✅ Sana oralig'i o'zgartirildi: ${days === 0 ? "Butun davr" : "Oxirgi " + days + " kun"}`);
    
    return bot.editMessageReplyMarkup(getChartsInlineKeyboard().inline_keyboard, {
      chat_id: chatId,
      message_id: messageId
    }).catch(console.error);
  }

  if (data === 'full_report') {
    const waitMsg = await bot.sendMessage(chatId, "⏳ To'liq hisobot tayyorlanmoqda...");
    try {
      const days = userDaysMap[chatId] || 0;
      const urlToVisit = `${dashboardUrl}?tab=analytics&bot=1&days=${days}`;
      const pdfBuffer = await generateDashboardPDF(urlToVisit);
      const nodeBuffer = Buffer.from(pdfBuffer);
      
      await bot.sendDocument(chatId, nodeBuffer, {
        caption: "📋 To'liq Hisobot"
      }, {
        filename: `Full_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        contentType: 'application/pdf',
      });
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Hisobotni tayyorlab bo'lmadi.");
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    }
    return;
  }

  if (data.startsWith('chart_')) {
    const rawId = data.replace('chart_', '');
    const waitMsg = await bot.sendMessage(chatId, "⏳ Grafik tayyorlanmoqda...");
    try {
      const days = userDaysMap[chatId] || 0;
      const pngBuffer = await generateChartScreenshot('chart-' + rawId, days);
      const nodeBuffer = Buffer.from(pngBuffer);

      // Using the chartId to show a somewhat readable caption
      const captionMap = {
        'daily-sales': '📈 Sotuv Trendi',
        'ending-doughnut': '🥧 Qoldiq Taqsimoti',
        'movement': '📊 Kirim vs Chiqim',
        'stock-balance': '⚖️ Boshlang\'ich vs Yakuniy',
        'avg-prices': '💰 Narxlar',
        'top-clients': '👥 Top Mijozlar',
        'net-move': '📉 Sof Harakat',
        'net-diff': '🔀 Sof Farq Balansi',
        'abc': '🏆 ABC Tahlili',
        'turnover': '🔄 Aylanma Tezligi'
      };

      await bot.sendPhoto(chatId, nodeBuffer, {
        caption: captionMap[rawId] || `📊 Grafik: ${rawId}`
      });
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Grafikni yuklab olishning iloji bo'lmadi.");
      bot.deleteMessage(chatId, waitMsg.message_id).catch(() => {});
    }
  }
});

// Express server for Render port binding and Health check
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Ombor Telegram Bot',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    allowedUsersCount: allowedUsers.length,
    dashboardUrl,
  });
});

app.listen(port, () => {
  console.log(`Web/Health server listening on port ${port}`);
});

// 24/7 Keep-Alive: Render free tier sleeps after 15 min if no web requests.
// This self-ping pings itself every 10 minutes to stay awake 24/7.
const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
if (keepAliveUrl) {
  console.log(`Setting up 24/7 keep-alive self-ping for ${keepAliveUrl} every 10 min...`);
  setInterval(async () => {
    try {
      const res = await fetch(keepAliveUrl);
      console.log(`[24/7 KeepAlive] Pinged ${keepAliveUrl} - Status: ${res.status}`);
    } catch (e) {
      console.warn(`[24/7 KeepAlive Warning]:`, e.message);
    }
  }, 10 * 60 * 1000);
}
