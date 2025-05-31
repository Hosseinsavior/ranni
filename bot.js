const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
const si = require('systeminformation');
const { botToken, botOwner, updatesChannel, timeGap, maxVideos, broadcastAsCopy } = require('./config');
const { addUserToDatabase, getUploadAsDoc, setUploadAsDoc, getGenerateSampleVideo, setGenerateSampleVideo, getGenerateSs, setGenerateSs, setThumbnail, getThumbnail, deleteUser, getAllUsers, totalUsersCount } = require('./db');
const { ensureDir, downloadFile, deleteAll, mergeVideo, cutSmallVideo, generateScreenshots, generateThumbnail, getVideoMetadata, uploadToStreamtape, uploadVideo } = require('./videoProcessor');
const path = require('path'); // اضافه کردن ماژول path

const bot = new Telegraf(botToken);

// دیتابیس و صف‌ها
const QueueDB = {};
const FormatDB = {};
const TimeGaps = {};
const broadcastIds = {};
const BROADCAST_LOG_FILE = 'broadcast.txt';

async function forceSub(ctx) {
  if (!updatesChannel) return 200;
  const chatId = updatesChannel.startsWith('-100') ? parseInt(updatesChannel) : updatesChannel;

  try {
    const user = await ctx.telegram.getChatMember(chatId, ctx.from.id);
    if (user.status === 'kicked') {
      await ctx.reply(
        'Sorry Sir, You are Banned to use me. Contact my [Support Group](https://t.me/Savior_128).',
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
      return 400;
    }
    if (['member', 'administrator', 'creator'].includes(user.status)) return 200;

    const inviteLink = await ctx.telegram.exportChatInviteLink(chatId);
    await ctx.reply(
      '**Please Join My Updates Channel to use this Bot!**\n\nDue to Overload, Only Channel Subscribers can use the Bot!',
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.url('🤖 Join Updates Channel', inviteLink)],
          [Markup.button.callback('🔄 Refresh 🔄', 'refreshFsub')],
        ]),
        parse_mode: 'Markdown',
      }
    );
    return 400;
  } catch (error) {
    if (error.response?.error_code === 429) {
      await new Promise((resolve) => setTimeout(resolve, error.response.parameters.retry_after * 1000));
      return forceSub(ctx);
    }
    console.error('ForceSub error:', error);
    await ctx.reply(
      `Something went wrong: ${error.message}\nContact my [Support Group](https://t.me/Savior_128).`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
    return 400;
  }
}

async function checkTimeGap(userId) {
  const currentTime = Date.now() / 1000;
  const userIdStr = userId.toString();
  if (TimeGaps[userIdStr]) {
    const previousTime = TimeGaps[userIdStr];
    const elapsedTime = currentTime - previousTime;
    if (elapsedTime < timeGap) {
      return { isInGap: true, sleepTime: Math.round(timeGap - elapsedTime) };
    } else {
      delete TimeGaps[userIdStr];
    }
  }
  TimeGaps[userIdStr] = currentTime;
  return { isInGap: false, sleepTime: null };
}

async function createReplyMarkup() {
  try {
    return Markup.inlineKeyboard([
      [Markup.button.url('Developer - @Savior_128', 'https://t.me/Savior_128')],
      [
        Markup.button.url('Support Group', 'https://t.me/Savior_128'),
        Markup.button.url('Bots Channel', 'https://t.me/Discovery_Updates'),
      ],
    ]);
  } catch (error) {
    console.error('Create reply markup error:', error);
    return null;
  }
}

bot.start(async (ctx) => {
  await addUserToDatabase(ctx);
  if ((await forceSub(ctx)) !== 200) return;
  await ctx.reply(
    `Hi Unkil, I am Video Merge Bot!\nI can Merge Multiple Videos in One Video. Video Formats should be same.\n\nAvailable Commands:\n/start - Start the bot\n/add - Add a video to queue\n/merge - Merge videos\n/clear - Clear queue\n/settings - Open settings\n\nMade by @Savior_128`,
    { reply_markup: await createReplyMarkup() }
  );
});

bot.on('video', async (ctx) => {
  await addUserToDatabase(ctx);
  if ((await forceSub(ctx)) !== 200) return;
  const file = ctx.message.video;
  const fileName = file.file_name || 'video.mp4';
  const extension = fileName.split('.').pop().toLowerCase();

  console.log('DEBUG: Processing video from user:', ctx.from.id, 'File:', fileName);

  if (!['mp4', 'mkv', 'webm'].includes(extension)) {
    return ctx.reply('Only MP4, MKV, or WEBM videos are allowed!', { reply_to_message_id: ctx.message.message_id });
  }

  if (!FormatDB[ctx.from.id]) FormatDB[ctx.from.id] = extension;
  if (FormatDB[ctx.from.id] !== extension) {
    return ctx.reply(`Please send only ${FormatDB[ctx.from.id].toUpperCase()} videos!`, { reply_to_message_id: ctx.message.message_id });
  }

  const { isInGap, sleepTime } = await checkTimeGap(ctx.from.id);
  if (isInGap) {
    return ctx.reply(`No flooding! Wait ${sleepTime}s before sending another video.`, { reply_to_message_id: ctx.message.message_id });
  }

  if (!QueueDB[ctx.from.id]) QueueDB[ctx.from.id] = [];
  if (QueueDB[ctx.from.id].length >= maxVideos) {
    return ctx.reply(`Max ${maxVideos} videos allowed! Use /merge to proceed.`);
  }

  const userDir = await ensureDir(ctx.from.id);
  const filePath = path.join(userDir, `${ctx.message.message_id}.${extension}`);
  await downloadFile(ctx, ctx.message.message_id, filePath);
  QueueDB[ctx.from.id].push(filePath);
  console.log('DEBUG: Updated QueueDB:', JSON.stringify(QueueDB[ctx.from.id]));
  await ctx.reply(`Video added to queue! Total videos: ${QueueDB[ctx.from.id].length}\nUse /merge to combine or /clear to reset.`);
});

bot.command('merge', async (ctx) => {
  const userId = ctx.from.id;
  if (!QueueDB[userId] || QueueDB[userId].length < 2) {
    return ctx.reply('Need at least 2 videos to merge! Use /add to add more.');
  }

  console.log(`DEBUG: Merge command started for user ${userId}`);

  let preparingMessage;
  try {
    preparingMessage = await ctx.reply('Preparing to merge videos...');
    console.log(`DEBUG: Preparing message sent, message_id: ${preparingMessage.message_id}`);
  } catch (error) {
    console.error(`DEBUG: Error sending preparing message:`, error.stack);
    return ctx.reply('Error starting merge process. Please try again.');
  }

  const userDir = await ensureDir(userId);
  const inputFile = path.join(userDir, 'input.txt');
  const videoPaths = QueueDB[userId];

  console.log(`DEBUG: Total valid video paths: ${videoPaths.length}`);
  if (videoPaths.length < 2) {
    await ctx.reply('Not enough valid videos to merge!');
    await deleteAll(userDir);
    delete QueueDB[userId];
    delete FormatDB[userId];
    return;
  }

  try {
    await require('fs').promises.writeFile(inputFile, videoPaths.map((p) => `file '${p}'`).join('\n'));
    console.log(`DEBUG: Input file created at ${inputFile} with content: ${videoPaths.map((p) => `file '${p}'`).join('\n')}`);
  } catch (error) {
    console.error(`DEBUG: Error writing input file:`, error.stack);
    await ctx.reply('Error preparing videos for merge.');
    await deleteAll(userDir);
    delete QueueDB[userId];
    delete FormatDB[userId];
    return;
  }

  console.log(`DEBUG: Starting FFmpeg merge process...`);
  const mergedVidPath = await mergeVideo(inputFile, userId, ctx, FormatDB[userId]);
  if (!mergedVidPath) {
    console.log(`DEBUG: Merge failed for user ${userId}`);
    await deleteAll(userDir);
    delete QueueDB[userId];
    delete FormatDB[userId];
    return;
  }

  console.log(`DEBUG: Merge successful, output path: ${mergedVidPath}`);
  let fileSize;
  try {
    fileSize = (await require('fs').promises.stat(mergedVidPath)).size;
  } catch (error) {
    console.error(`DEBUG: Error getting file size:`, error.stack);
    await ctx.reply('Error processing merged video.');
    await deleteAll(userDir);
    delete QueueDB[userId];
    delete FormatDB[userId];
    return;
  }

  if (fileSize > 2097152000) {
    await ctx.reply(`File too large (${humanbytes(fileSize)}). Uploading to Streamtape...`);
    await uploadToStreamtape(mergedVidPath, ctx, fileSize);
    await deleteAll(userDir);
    delete QueueDB[userId];
    delete FormatDB[userId];
    return;
  }

  await ctx.reply('Extracting video data...');
  let metadata;
  try {
    metadata = await getVideoMetadata(mergedVidPath);
  } catch (error) {
    console.error(`DEBUG: Error extracting metadata: ${error.message}`);
    await ctx.reply('Error extracting video metadata.');
    await deleteAll(userDir);
    delete QueueDB[userId];
    delete FormatDB[userId];
    return;
  }
  const { duration, width, height } = metadata;

  let thumbnail = await getThumbnail(userId);
  if (thumbnail) {
    const thumbPath = path.join(require('./config').downPath, userId.toString(), 'thumbnail.jpg');
    try {
      await downloadFile(ctx, thumbnail, thumbPath);
      await sharp(thumbPath).resize(width, height).jpeg().toFile(thumbPath);
      thumbnail = thumbPath;
    } catch (error) {
      console.error(`DEBUG: Error processing thumbnail: ${error.message}`);
      thumbnail = null;
    }
  }
  if (!thumbnail) {
    try {
      thumbnail = await generateThumbnail(mergedVidPath, userId, duration);
    } catch (error) {
      console.error(`DEBUG: Error generating thumbnail: ${error.message}`);
    }
  }

  const shouldGenerateSs = await getGenerateSs(userId);
  const shouldGenerateSample = await getGenerateSampleVideo(userId);
  if (shouldGenerateSs) {
    try {
      const screenshots = await generateScreenshots(mergedVidPath, path.join(require('./config').downPath, userId.toString()), 4, duration);
      if (screenshots.length > 0) {
        await ctx.replyWithMediaGroup(
          screenshots.map((s) => ({ type: 'photo', media: { source: s } }))
        );
      }
    } catch (error) {
      console.error(`DEBUG: Error generating screenshots: ${error.message}`);
    }
  }
  if (shouldGenerateSample) {
    try {
      const samplePath = await cutSmallVideo(
        mergedVidPath,
        path.join(require('./config').downPath, userId.toString()),
        0,
        Math.min(30, duration),
        FormatDB[userId]
      );
      if (samplePath) {
        await ctx.replyWithVideo({ source: samplePath }, { caption: 'Sample Video' });
      }
    } catch (error) {
      console.error(`DEBUG: Error generating sample video: ${error.message}`);
    }
  }

  const startTime = Date.now() / 1000;
  try {
    await uploadVideo(ctx, mergedVidPath, width, height, duration, thumbnail, fileSize, startTime);
  } catch (error) {
    console.error(`DEBUG: Error uploading video: ${error.stack}`);
    await ctx.reply('Error uploading the final video.');
  }

  await deleteAll(path.join(require('./config').downPath, userId.toString()));
  delete QueueDB[userId];
  delete FormatDB[userId];
});

bot.command('clear', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.reply('Cancelling process...');
  await deleteAll(path.join(require('./config').downPath, userId.toString()));
  delete QueueDB[userId];
  delete FormatDB[userId];
  await ctx.reply('Queue cleared successfully!');
});

bot.on('photo', async (ctx) => {
  await addUserToDatabase(ctx);
  if ((await forceSub(ctx)) !== 200) return;
  const editable = await ctx.reply('Saving thumbnail...', { reply_to_message_id: ctx.message.message_id });
  try {
    await setThumbnail(ctx.from.id, ctx.message.photo[ctx.message.photo.length - 1].file_id);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      editable.message_id,
      null,
      'Thumbnail saved!',
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('Show Thumbnail', 'showThumbnail')],
          [Markup.button.callback('Delete Thumbnail', 'deleteThumbnail')],
        ]),
      }
    );
  } catch (error) {
    console.error('Thumbnail save error:', error);
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        editable.message_id,
        null,
        'Error saving thumbnail.'
      );
    } catch (editError) {
      await ctx.reply('Error saving thumbnail.');
    }
  }
});

bot.command('settings', async (ctx) => {
  await addUserToDatabase(ctx);
  if ((await forceSub(ctx)) !== 200) return;
  const editable = await ctx.reply('Opening settings...');
  await openSettings(ctx, editable);
});

bot.command('broadcast', async (ctx) => {
  if (ctx.from.id.toString() !== botOwner || !ctx.message.reply_to_message) return;
  const broadcastMsg = ctx.message.reply_to_message;
  const broadcastId = crypto.randomBytes(3).toString('hex');
  const out = await ctx.reply('Broadcast Started! You will reply with log file when all the users are notified.');
  const startTime = Date.now();
  const totalUsers = await totalUsersCount();
  let done = 0, failed = 0, success = 0;
  broadcastIds[broadcastId] = { total: totalUsers, current: done, failed, success };

  try {
    await require('fs').promises.writeFile(BROADCAST_LOG_FILE, '');
    const users = await getAllUsers();
    for (const user of users) {
      const userId = user.id;
      const { status, error } = await sendMsg(userId, broadcastMsg);
      if (error) {
        await require('fs').promises.appendFile(BROADCAST_LOG_FILE, error);
      }
      if (status === 200) {
        success++;
      } else {
        failed++;
        if (status === 400) {
          await deleteUser(userId);
        }
      }
      done++;
      broadcastIds[broadcastId] = { total: totalUsers, current: done, failed, success };
    }

    delete broadcastIds[broadcastId];
    const completedIn = Math.floor((Date.now() - startTime) / 1000);
    await ctx.telegram.deleteMessage(ctx.chat.id, out.message_id);

    if (failed === 0) {
      await ctx.reply(
        `Broadcast completed in \`${completedIn}s\`\n\nTotal users ${totalUsers}.\nTotal done ${done}, ${success} success and ${failed} failed.`,
        { parse_mode: 'Markdown', reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await ctx.replyWithDocument(
        { source: BROADCAST_LOG_FILE },
        {
          caption: `Broadcast completed in \`${completedIn}s\`\n\nTotal users ${totalUsers}.\nTotal done ${done}, ${success} success and ${failed} failed.`,
          parse_mode: 'Markdown',
          reply_to_message_id: ctx.message.message_id,
        }
      );
    }
  } catch (error) {
    console.error('Broadcast error:', error);
    await ctx.reply(`Error sending broadcast: ${error.message}`);
  } finally {
    await require('fs').promises.unlink(BROADCAST_LOG_FILE).catch(() => {});
  }
});

async function sendMsg(userId, message) {
  try {
    if (broadcastAsCopy) {
      await message.copy(userId);
    } else {
      await message.forward(userId);
    }
    return { status: 200, error: null };
  } catch (error) {
    if (error.response?.error_code === 429) {
      await new Promise((resolve) => setTimeout(resolve, error.response.parameters.retry_after * 1000));
      return sendMsg(userId, message);
    }
    if ([403, 400].includes(error.response?.error_code)) {
      return { status: 400, error: `${userId} : ${error.message}\n` };
    }
    return { status: 500, error: `${userId} : ${error.stack}\n` };
  }
}

bot.command('status', async (ctx) => {
  if (ctx.from.id.toString() !== botOwner) return;
  try {
    const disk = await si.fsSize();
    const cpu = await si.cpu();
    const mem = await si.mem();
    const totalUsers = await totalUsersCount();
    const total = (disk[0].size / 1024 ** 3).toFixed(2);
    const used = (disk[0].used / 1024 ** 3).toFixed(2);
    const free = ((disk[0].size - disk[0].used) / 1024 ** 3).toFixed(2);
    const cpuUsage = cpu.currentLoad;
    const ramUsage = (mem.used / mem.total) * 100;
    await ctx.reply(
      `**Total Disk:** ${total} GB\n**Used:** ${used} GB\n**Free:** ${free} GB\n**CPU Usage:** ${cpuUsage.toFixed(2)}%\n**RAM Usage:** ${ramUsage.toFixed(2)}%\n**Users:** ${totalUsers}`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Status error:', error);
    await ctx.reply('Error fetching status.');
  }
});

bot.command('check', async (ctx) => {
  if (ctx.from.id.toString() !== botOwner || !ctx.message.text.split(' ')[1]) return;
  try {
    const userId = parseInt(ctx.message.text.split(' ')[1]);
    const user = await ctx.telegram.getChat(userId);
    const settings = await require('./db').getAllUsers().find(u => u.id === userId);
    await ctx.reply(
      `**Name:** [${user.first_name}](tg://user?id=${userId})\n**Username:** @${user.username || 'None'}\n**Upload as Doc:** ${settings?.upload_as_doc || false}\n**Generate Screenshots:** ${settings?.generate_ss || false}\n**Generate Sample Video:** ${settings?.generate_sample_video || false}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  } catch (error) {
    console.error('Check error:', error);
    await ctx.reply('Error fetching user details.');
  }
});

bot.action('showThumbnail', async (ctx) => {
  try {
    const fileId = await getThumbnail(ctx.from.id);
    if (fileId) {
      await ctx.answerCbQuery('Sending thumbnail...');
      await ctx.replyWithPhoto(fileId, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('Delete Thumbnail', 'deleteThumbnail')]]),
      });
    } else {
      await ctx.answerCbQuery('No thumbnail found!', { show_alert: true });
    }
  } catch (error) {
    console.error('Show thumbnail error:', error);
    await ctx.answerCbQuery('Error fetching thumbnail.');
  }
});

bot.action('deleteThumbnail', async (ctx) => {
  try {
    await setThumbnail(ctx.from.id, null);
    await ctx.editMessageText('Thumbnail deleted!');
  } catch (error) {
    console.error('Delete thumbnail error:', error);
    try {
      await ctx.editMessageText('Error deleting thumbnail.');
    } catch (editError) {
      await ctx.reply('Error deleting thumbnail.');
    }
  }
});

bot.action('refreshFsub', async (ctx) => {
  if ((await forceSub(ctx)) === 200) {
    await ctx.editMessageText(
      `Hi Unkil, I am Video Merge Bot!\nI can Merge Multiple Videos in One Video. Video Formats should be same.\n\nAvailable Commands:\n/start - Start the bot\n/add - Add a video to queue\n/merge - Merge videos\n/clear - Clear queue\n/settings - Open settings\n\nMade by @Savior_128`,
      { reply_markup: await createReplyMarkup() }
    );
  }
});

async function openSettings(ctx, message) {
  try {
    const uploadAsDoc = await getUploadAsDoc(ctx.from.id);
    const generateSampleVideo = await getGenerateSampleVideo(ctx.from.id);
    const generateSs = await getGenerateSs(ctx.from.id);
    const settingsText = 'Here You Can Change or Configure Your Settings:';
    const markup = Markup.inlineKeyboard([
      [Markup.button.callback(`Upload as ${uploadAsDoc ? 'Document' : 'Video'} ✅`, 'triggerUploadMode')],
      [Markup.button.callback(`Generate Sample Video ${generateSampleVideo ? '✅' : '❌'}`, 'triggerGenSample')],
      [Markup.button.callback(`Generate Screenshots ${generateSs ? '✅' : '❌'}`, 'triggerGenSS')],
      [Markup.button.callback('Show Thumbnail', 'showThumbnail')],
      [Markup.button.callback('Close', 'closeMeh')],
    ]);

    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        message.message_id,
        null,
        settingsText,
        { reply_markup: markup }
      );
    } catch (editError) {
      console.error('Edit message error:', editError);
      await ctx.reply(settingsText, { reply_markup: markup });
    }
  } catch (error) {
    console.error('Settings error:', error);
    try {
      await ctx.reply('Error opening settings.');
    } catch (replyError) {
      console.error('Reply error:', replyError);
    }
  }
}

function humanbytes(size) {
  if (size === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let n = 0;
  while (size > 1024 && n < units.length - 1) {
    size /= 1024;
    n++;
  }
  return `${size.toFixed(2)} ${units[n]}`;
}

module.exports = { bot };