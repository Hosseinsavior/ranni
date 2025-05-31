require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN || '5115356918:AAFH3T-1f2x4ZdikRQnNoOXXgonLUlwryAQ',
  botOwner: process.env.BOT_OWNER || '5059280908',
  updatesChannel: process.env.UPDATES_CHANNEL || '',
  logChannel: process.env.LOG_CHANNEL || '',
  downPath: process.env.DOWN_PATH || '/tmp', // استفاده از /tmp برای Render
  timeGap: parseInt(process.env.TIME_GAP) || 5,
  maxVideos: parseInt(process.env.MAX_VIDEOS) || 5,
  streamtapeUsername: process.env.STREAMTAPE_API_USERNAME || 'e570d9deef272a462305',
  streamtapePass: process.env.STREAMTAPE_API_PASS || '3w8wLp7ZPludYbW',
  mongoUri: process.env.MONGODB_URI || 'mongodb+srv://saviorsann:TDzeYsGIJwvVkRy4@cluster0.9otjsyr.mongodb.net/video_merge_bot?retryWrites=true&w=majority',
  broadcastAsCopy: process.env.BROADCAST_AS_COPY === 'true',
  captionTemplate: process.env.CAPTION_TEMPLATE || "Video Merged by @{botUsername}\n\nMade by @Savior_128",
  port: process.env.PORT || 3000, // برای Render
};