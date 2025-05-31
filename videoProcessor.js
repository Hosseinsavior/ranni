// videoProcessor.js - پردازش ویدیو
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const config = require('./config');

async function mergeVideos(inputFiles, userId, format) {
  const outputPath = path.join(config.DOWN_PATH, userId.toString(), `merged.${format}`);
  const tempFile = path.join(config.DOWN_PATH, userId.toString(), 'filelist.txt');
  
  await fs.writeFile(tempFile, inputFiles.map(f => `file '${f}'`).join('\n'));
  
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(tempFile)
      .inputFormat('concat')
      .inputOptions(['-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

async function generateThumbnail(videoPath, userId) {
  const thumbPath = path.join(config.DOWN_PATH, userId.toString(), 'thumbnail.jpg');
  
  return new Promise((resolve) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['50%'],
        filename: 'thumbnail.jpg',
        folder: path.dirname(thumbPath),
        size: '320x240'
      })
      .on('end', () => {
        sharp(thumbPath)
          .resize(320, 240)
          .toFile(thumbPath)
          .then(() => resolve(thumbPath))
          .catch(() => resolve(null));
      })
      .on('error', () => resolve(null));
  });
}

module.exports = { mergeVideos, generateThumbnail };