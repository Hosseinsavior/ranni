const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const FormData = require('form-data');
const { botToken, downPath, streamtapeUsername, streamtapePass, timeGap } = require('./config');

// تنظیم مسیر FFmpeg با ffmpeg-static
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);
console.log('DEBUG: FFmpeg path set to:', ffmpegPath);

async function ensureDir(userId) {
  const dir = path.join(downPath, userId.toString());
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function downloadFile(ctx, fileId, filePath) {
  try {
    const file = await ctx.telegram.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
    const response = await axios.get(url, { responseType: 'stream' });
    const writer = response.data.pipe(require('fs').createWriteStream(filePath));
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Download file error:', error);
    throw error;
  }
}

async function deleteAll(root) {
  try {
    if (await fs.access(root).then(() => true).catch(() => false)) {
      await fs.rm(root, { recursive: true, force: true });
      return true;
    }
    console.log(`DEBUG: Folder '${root}' does not exist.`);
    return false;
  } catch (error) {
    console.error(`DEBUG: Error deleting folder '${root}':`, error);
    return false;
  }
}

async function mergeVideo(inputFile, userId, ctx, format) {
  const outputVid = path.join(downPath, userId.toString(), `[@Savior_128]_Merged.${format.toLowerCase()}`);

  console.log(`DEBUG: Starting merge with input file: ${inputFile}, output: ${outputVid}`);

  return new Promise((resolve) => {
    ffmpeg()
      .input(inputFile)
      .inputFormat('concat')
      .inputOptions('-safe', '0')
      .outputOptions('-c', 'copy')
      .output(outputVid)
      .on('start', (commandLine) => {
        console.log(`DEBUG: FFmpeg command started: ${commandLine}`);
      })
      .on('progress', (progress) => {
        console.log(`DEBUG: FFmpeg progress: ${JSON.stringify(progress)}`);
      })
      .on('error', (err, stdout, stderr) => {
        console.error(`DEBUG: FFmpeg error: ${err.message}`, stderr);
        ctx.reply(`Failed to merge videos! Error: ${err.message}`);
        resolve(null);
      })
      .on('end', async () => {
        console.log(`DEBUG: FFmpeg merge completed for ${outputVid}`);
        if (await fs.access(outputVid).then(() => true).catch(() => false)) {
          resolve(outputVid);
        } else {
          console.log('DEBUG: Merged video file does not exist.');
          ctx.reply('Failed to create merged video.');
          resolve(null);
        }
      })
      .run();

    ctx.editMessageText('Merging Video Now ...\n\nPlease Keep Patience ...').catch((err) => {
      console.error('DEBUG: Edit message error:', err.stack);
      ctx.reply('Merging Video Now ...\n\nPlease Keep Patience ...');
    });
  });
}

async function cutSmallVideo(videoFile, outputDirectory, startTime, endTime, format) {
  const outputFileName = path.join(outputDirectory, `${Date.now()}.${format.toLowerCase()}`);

  console.log(`DEBUG: Starting cut with input: ${videoFile}, output: ${outputFileName}`);

  return new Promise((resolve) => {
    ffmpeg(videoFile)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .outputOptions('-async', '1', '-strict', '-2')
      .output(outputFileName)
      .on('start', (commandLine) => {
        console.log(`DEBUG: FFmpeg command started (cut): ${commandLine}`);
      })
      .on('progress', (progress) => {
        console.log(`DEBUG: FFmpeg progress (cut): ${JSON.stringify(progress)}`);
      })
      .on('error', (err, stdout, stderr) => {
        console.error(`DEBUG: FFmpeg error (cut): ${err.message}`, stderr);
        resolve(null);
      })
      .on('end', async () => {
        console.log(`DEBUG: FFmpeg cut completed for ${outputFileName}`);
        if (await fs.access(outputFileName).then(() => true).catch(() => false)) {
          resolve(outputFileName);
        } else {
          console.log('DEBUG: Cut video file does not exist.');
          resolve(null);
        }
      })
      .run();
  });
}

async function generateScreenshots(videoFile, outputDirectory, noOfPhotos, duration) {
  if (duration <= 0 || noOfPhotos <= 0) {
    console.log('DEBUG: Invalid duration or number of photos.');
    return [];
  }

  const images = [];
  const ttlStep = duration / noOfPhotos;
  let currentTtl = ttlStep;

  for (let i = 0; i < noOfPhotos; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const videoThumbnail = path.join(outputDirectory, `${Date.now()}.jpg`);

    console.log(`DEBUG: Generating screenshot at ${currentTtl}s, output: ${videoThumbnail}`);

    await new Promise((resolve) => {
      ffmpeg(videoFile)
        .setStartTime(Math.round(currentTtl))
        .outputOptions('-vframes', '1')
        .output(videoThumbnail)
        .on('start', (commandLine) => {
          console.log(`DEBUG: FFmpeg command started (screenshot): ${commandLine}`);
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`DEBUG: FFmpeg error (screenshot): ${err.message}`, stderr);
          resolve();
        })
        .on('end', async () => {
          if (await fs.access(videoThumbnail).then(() => true).catch(() => false)) {
            images.push(videoThumbnail);
          }
          resolve();
        })
        .run();
    });

    currentTtl += ttlStep;
  }
  return images;
}

async function generateThumbnail(filePath, userId, duration) {
  try {
    const thumbPath = path.join(downPath, userId.toString(), 'thumbnail.jpg');
    const ttl = Math.floor(Math.random() * duration);

    console.log(`DEBUG: Generating thumbnail at ${ttl}s, output: ${thumbPath}`);

    return new Promise((resolve) => {
      ffmpeg(filePath)
        .setStartTime(ttl)
        .outputOptions('-vframes', '1')
        .output(thumbPath)
        .on('start', (commandLine) => {
          console.log(`DEBUG: FFmpeg command started (thumbnail): ${commandLine}`);
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`DEBUG: FFmpeg error (thumbnail): ${err.message}`, stderr);
          resolve(null);
        })
        .on('end', async () => {
          if (await fs.access(thumbPath).then(() => true).catch(() => false)) {
            await sharp(thumbPath).jpeg().toFile(thumbPath);
            resolve(thumbPath);
          } else {
            console.log('DEBUG: Thumbnail file does not exist.');
            resolve(null);
          }
        })
        .run();
    });
  } catch (error) {
    console.error('Thumbnail error:', error);
    return null;
  }
}

async function getVideoMetadata(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error(`DEBUG: FFprobe error: ${err.message}`);
        resolve({ duration: 1, width: 100, height: 100 });
      } else {
        console.log(`DEBUG: FFprobe metadata: ${JSON.stringify(metadata)}`);
        resolve({
          duration: Math.round(metadata.format.duration),
          width: metadata.streams[0]?.width || 100,
          height: metadata.streams[0]?.height || 100,
        });
      }
    });
  });
}

async function uploadToStreamtape(file, ctx, fileSize) {
  try {
    const mainApi = `https://api.streamtape.com/file/ul?login=${streamtapeUsername}&key=${streamtapePass}`;
    const hitApi = await axios.get(mainApi);
    const jsonData = hitApi.data;

    if (jsonData.result?.url) {
      const formData = new FormData();
      formData.append('file1', require('fs').createReadStream(file));
      const response = await axios.post(jsonData.result.url, formData, {
        headers: formData.getHeaders(),
      });
      const data = response.data;

      if (data.result?.url) {
        const downloadLink = data.result.url;
        const filename = path.basename(file).replace('_', ' ');
        const textEdit = `File Uploaded to Streamtape!\n\n` +
          `**File Name:** \`${filename}\`\n` +
          `**Size:** \`${humanbytes(fileSize)}\`\n` +
          `**Link:** \`${downloadLink}\``;
        try {
          await ctx.editMessageText(textEdit, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: require('telegraf').Markup.inlineKeyboard([[require('telegraf').Markup.button.url('Open Link', downloadLink)]]),
          });
        } catch (editError) {
          await ctx.reply(textEdit, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: require('telegraf').Markup.inlineKeyboard([[require('telegraf').Markup.button.url('Open Link', downloadLink)]]),
          });
        }
      } else {
        throw new Error('Failed to retrieve download link from Streamtape.');
      }
    } else {
      throw new Error('Failed to authenticate with Streamtape API.');
    }
  } catch (error) {
    console.error('Streamtape error:', error);
    try {
      await ctx.reply(
        'Sorry, Something went wrong!\n\nCan\'t Upload to Streamtape. You can report at [Support Group](https://t.me/Savior_128).',
        { parse_mode: 'Markdown' }
      );
    } catch (replyError) {
      console.error('Reply error:', replyError);
    }
  }
}

async function uploadVideo(ctx, filePath, width, height, duration, thumbnail, fileSize, startTime) {
  try {
    console.log(`DEBUG: Starting upload for file: ${filePath}`);
    const isUploadAsDoc = await require('./db').getUploadAsDoc(ctx.from.id);
    const botUsername = (await ctx.telegram.getMe()).username;
    const fileName = path.basename(filePath);
    const caption = require('./config').captionTemplate.replace('{botUsername}', `@${botUsername}`);
    let sent;

    if (!isUploadAsDoc) {
      sent = await ctx.telegram.sendVideo(
        ctx.chat.id,
        { source: filePath },
        {
          width,
          height,
          duration,
          thumb: thumbnail,
          caption,
          parse_mode: 'Markdown',
          reply_markup: await createReplyMarkup(),
          progress: (current, total) => progressForTelegraf(current, total, 'Uploading Video ...', ctx, startTime),
        }
      );
    } else {
      sent = await ctx.telegram.sendDocument(
        ctx.chat.id,
        { source: filePath },
        {
          thumb: thumbnail,
          caption,
          parse_mode: 'Markdown',
          reply_markup: await createReplyMarkup(),
          progress: (current, total) => progressForTelegraf(current, total, 'Uploading Video ...', ctx, startTime),
        }
      );
    }

    console.log(`DEBUG: Upload completed, message_id: ${sent.message_id}`);

    await new Promise((resolve) => setTimeout(resolve, timeGap * 1000));
    if (require('./config').logChannel) {
      const forwarded = await sent.copy(require('./config').logChannel);
      await ctx.telegram.sendMessage(
        require('./config').logChannel,
        `**User:** [${ctx.from.first_name}](tg://user?id=${ctx.from.id})\n**Username:** @${ctx.from.username || 'None'}\n**UserID:** \`${ctx.from.id}\``,
        { reply_to_message_id: forwarded.message_id, parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    }

    await ctx.reply('Video uploaded successfully!');
  } catch (error) {
    console.error('DEBUG: Upload error:', error.stack);
    try {
      await ctx.reply(`Failed to upload video!\nError: ${error.message}`);
    } catch (editError) {
      await ctx.reply(`Failed to upload video!\nError: ${error.message}`);
    }
  }
}

async function progressForTelegraf(current, total, udType, ctx, start) {
  if (current >= total) return true;

  const now = Date.now() / 1000;
  const diff = now - start;

  if (Math.round(diff % 10) === 0) {
    const percentage = (current / total) * 100;
    const speed = diff > 0 ? current / diff : 0;
    const elapsedTime = Math.round(diff) * 1000;
    const timeToCompletion = speed > 0 ? Math.round(((total - current) / speed) * 1000) : 0;
    const estimatedTotalTime = elapsedTime + timeToCompletion;

    const progressMessage = `
Percentage : ${percentage.toFixed(2)}%
Done: ${humanbytes(current)}
Total: ${humanbytes(total)}
Speed: ${humanbytes(speed)}/s
ETA: ${timeFormatter(estimatedTotalTime) || '0 s'}
    `;

    const progressBar = '[' +
      '●'.repeat(Math.floor(percentage / 5)) +
      '○'.repeat(20 - Math.floor(percentage / 5)) +
      ']';

    try {
      await ctx.editMessageText(
        `**${udType}**\n\n${progressBar}\n${progressMessage}`,
        { parse_mode: 'Markdown' }
      );
      return true;
    } catch (error) {
      console.error('Progress update error:', error);
      return false;
    }
  }
  return true;
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

function timeFormatter(milliseconds) {
  if (!milliseconds) return '';
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours % 24) parts.push(`${hours % 24}h`);
  if (minutes % 60) parts.push(`${minutes % 60}m`);
  if (seconds % 60) parts.push(`${seconds % 60}s`);
  if (milliseconds % 1000) parts.push(`${milliseconds % 1000}ms`);
  return parts.join(', ');
}

async function createReplyMarkup() {
  try {
    return require('telegraf').Markup.inlineKeyboard([
      [require('telegraf').Markup.button.url('Developer - @Savior_128', 'https://t.me/Savior_128')],
      [
        require('telegraf').Markup.button.url('Support Group', 'https://t.me/Savior_128'),
        require('telegraf').Markup.button.url('Bots Channel', 'https://t.me/Discovery_Updates'),
      ],
    ]);
  } catch (error) {
    console.error('Create reply markup error:', error);
    return null;
  }
}

module.exports = {
  ensureDir,
  downloadFile,
  deleteAll,
  mergeVideo,
  cutSmallVideo,
  generateScreenshots,
  generateThumbnail,
  getVideoMetadata,
  uploadToStreamtape,
  uploadVideo,
};