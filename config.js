// config.js - مدیریت تنظیمات
require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  BOT_OWNER: process.env.BOT_OWNER || '5059280908',
  MONGODB_URI: process.env.MONGODB_URI,
  STREAMTAPE_USER: process.env.STREAMTAPE_API_USERNAME,
  STREAMTAPE_PASS: process.env.STREAMTAPE_API_PASS,
  MAX_VIDEOS: parseInt(process.env.MAX_VIDEOS) || 5,
  TIME_GAP: parseInt(process.env.TIME_GAP) || 5,
  DOWN_PATH: process.env.DOWN_PATH || './downloads'
};