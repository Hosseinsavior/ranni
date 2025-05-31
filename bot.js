// bot.js - بخش اصلی ربات
const { Telegraf, Markup } = require('telegraf');
const { getDB } = require('./db');
const { mergeVideos, generateThumbnail } = require('./videoProcessor');
const config = require('./config');
const fs = require('fs').promises;
const path = require('path');

const bot = new Telegraf(config.BOT_TOKEN);
const userQueues = new Map();

// Middleware برای مدیریت صف کاربران
bot.use(async (ctx, next) => {
  if (!userQueues.has(ctx.from.id)) {
    userQueues.set(ctx.from.id, {
      videos: [],
      format: null,
      processing: false
    });
  }
  await next();
});

// دستور start
bot.start(async (ctx) => {
  await ctx.reply(
    'به ربات ادغام ویدیو خوش آمدید! 🎬\n\n' +
    'ویدیوها را ارسال کنید و سپس از دستور /merge برای ادغام استفاده نمایید.',
    Markup.keyboard([['/merge', '/clear']]).resize()
  );
});

// دریافت ویدیوها
bot.on('video', async (ctx) => {
  const userQueue = userQueues.get(ctx.from.id);
  
  if (userQueue.processing) {
    return ctx.reply('لطفاً صبر کنید تا پردازش فعلی تمام شود.');
  }

  const fileExt = ctx.message.video.file_name?.split('.').pop() || 'mp4';
  
  if (!['mp4', 'mkv', 'webm'].includes(fileExt)) {
    return ctx.reply('فرمت ویدیو باید MP4, MKV یا WEBM باشد.');
  }

  if (userQueue.format && userQueue.format !== fileExt) {
    return ctx.reply(`لطفاً فقط ویدیوهای ${userQueue.format.toUpperCase()} ارسال کنید.`);
  }

  userQueue.format = userQueue.format || fileExt;
  userQueue.videos.push(ctx.message);

  await ctx.reply(`ویدیو به صف اضافه شد. (تعداد: ${userQueue.videos.length})`);
});

// دستور merge
bot.command('merge', async (ctx) => {
  const userQueue = userQueues.get(ctx.from.id);
  
  if (userQueue.processing) {
    return ctx.reply('در حال حاضر پردازش در حال انجام است.');
  }

  if (userQueue.videos.length < 2) {
    return ctx.reply('حداقل ۲ ویدیو برای ادغام نیاز است.');
  }

  userQueue.processing = true;
  const processingMsg = await ctx.reply('در حال پردازش ویدیوها...');

  try {
    // ایجاد پوشه کاربر
    const userDir = path.join(config.DOWN_PATH, ctx.from.id.toString());
    await fs.mkdir(userDir, { recursive: true });

    // دانلود ویدیوها
    const videoPaths = [];
    for (const [index, videoMsg] of userQueue.videos.entries()) {
      const progressMsg = await ctx.reply(`در حال دانلود ویدیو ${index + 1} از ${userQueue.videos.length}...`);
      const filePath = path.join(userDir, `video_${index}.${userQueue.format}`);
      
      try {
        const fileLink = await ctx.telegram.getFileLink(videoMsg.video.file_id);
        await downloadFile(fileLink.href, filePath);
        videoPaths.push(filePath);
        await ctx.telegram.deleteMessage(ctx.chat.id, progressMsg.message_id);
      } catch (err) {
        console.error('Download error:', err);
        await ctx.reply(`خطا در دانلود ویدیو ${index + 1}`);
      }
    }

    if (videoPaths.length < 2) {
      throw new Error('ویدیوهای کافی برای ادغام دانلود نشدند.');
    }

    // ادغام ویدیوها
    await ctx.reply('در حال ادغام ویدیوها...');
    const mergedPath = await mergeVideos(videoPaths, ctx.from.id, userQueue.format);

    // تولید تامبنیل
    await ctx.reply('در حال تولید پیش‌نمایش...');
    const thumbnailPath = await generateThumbnail(mergedPath, ctx.from.id);

    // آپلود ویدیو
    await ctx.reply('در حال آپلود ویدیو ادغام شده...');
    await ctx.replyWithVideo(
      { source: mergedPath },
      {
        thumb: thumbnailPath ? { source: thumbnailPath } : undefined,
        caption: 'ویدیوهای شما با موفقیت ادغام شدند 🎉',
        reply_markup: Markup.inlineKeyboard([
          Markup.button.url('توسعه‌دهنده', 'https://t.me/Savior_128')
        ])
      }
    );

  } catch (err) {
    console.error('Merge error:', err);
    await ctx.reply('خطا در پردازش ویدیوها: ' + err.message);
  } finally {
    // پاکسازی فایل‌های موقت
    try {
      const userDir = path.join(config.DOWN_PATH, ctx.from.id.toString());
      await fs.rm(userDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    // ریست وضعیت کاربر
    userQueue.videos = [];
    userQueue.processing = false;
    userQueue.format = null;
    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
  }
});

// تابع کمکی دانلود
async function downloadFile(url, path) {
  const writer = require('fs').createWriteStream(path);
  const response = await require('axios')({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// راه‌اندازی ربات
(async () => {
  try {
    await getDB(); // اطمینان از اتصال به دیتابیس
    await bot.launch();
    console.log('Bot started successfully');
  } catch (err) {
    console.error('Bot startup error:', err);
    process.exit(1);
  }
})();

// مدیریت خطاها
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));