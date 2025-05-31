const { MongoClient } = require('mongodb');
const { mongoUri, botOwner } = require('./config');
const { Telegraf } = require('telegraf');

let db;

async function connectMongoDB() {
  try {
    console.log('Attempting to connect to MongoDB...');
    const client = await MongoClient.connect(mongoUri, { useUnifiedTopology: true });
    db = client.db('video_merge_bot');
    console.log('Connected to MongoDB successfully');
    if (botOwner) {
      const bot = new Telegraf(process.env.BOT_TOKEN);
      await bot.telegram.sendMessage(botOwner, 'Successfully connected to MongoDB!')
        .catch((err) => console.error('Failed to notify owner:', err));
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
    if (botOwner) {
      const bot = new Telegraf(process.env.BOT_TOKEN);
      await bot.telegram.sendMessage(botOwner, `MongoDB connection failed: ${err.message}`)
        .catch((e) => console.error('Failed to notify owner:', e));
    }
    throw err;
  }
}

async function addUserToDatabase(ctx) {
  try {
    if (!db) throw new Error('Database not connected');
    const userId = ctx.from.id;
    const userExists = await db.collection('users').findOne({ id: userId });

    if (!userExists) {
      await db.collection('users').insertOne({
        id: userId,
        join_date: new Date().toISOString().split('T')[0],
        upload_as_doc: false,
        thumbnail: null,
        generate_ss: false,
        generate_sample_video: false,
        username: ctx.from.username || 'unknown',
        updated_at: new Date(),
      });
      console.log(`User ${userId} added to database successfully.`);

      if (require('./config').logChannel) {
        const botUsername = (await ctx.telegram.getMe()).username;
        await ctx.telegram.sendMessage(
          require('./config').logChannel,
          `#NEW_USER: \n\nNew User [${ctx.from.first_name}](tg://user?id=${userId}) started @${botUsername} !!`,
          { parse_mode: 'Markdown' }
        );
      }
    }
  } catch (error) {
    console.error('Add user error:', error);
    await ctx.reply(
      'An error occurred while adding you to the database. Please try again later or contact the [Support Group](https://t.me/Savior_128).',
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }
}

async function getUploadAsDoc(userId) {
  if (!db) throw new Error('Database not connected');
  const user = await db.collection('users').findOne({ id: userId });
  return user?.upload_as_doc || false;
}

async function setUploadAsDoc(userId, uploadAsDoc) {
  if (!db) throw new Error('Database not connected');
  await db.collection('users').updateOne(
    { id: userId },
    { $set: { upload_as_doc: uploadAsDoc, updated_at: new Date() } }
  );
}

async function getGenerateSampleVideo(userId) {
  if (!db) throw new Error('Database not connected');
  const user = await db.collection('users').findOne({ id: userId });
  return user?.generate_sample_video || false;
}

async function setGenerateSampleVideo(userId, generateSampleVideo) {
  if (!db) throw new Error('Database not connected');
  await db.collection('users').updateOne(
    { id: userId },
    { $set: { generate_sample_video: generateSampleVideo, updated_at: new Date() } }
  );
}

async function getGenerateSs(userId) {
  if (!db) throw new Error('Database not connected');
  const user = await db.collection('users').findOne({ id: userId });
  return user?.generate_ss || false;
}

async function setGenerateSs(userId, generateSs) {
  if (!db) throw new Error('Database not connected');
  await db.collection('users').updateOne(
    { id: userId },
    { $set: { generate_ss: generateSs, updated_at: new Date() } }
  );
}

async function setThumbnail(userId, fileId) {
  if (!db) throw new Error('Database not connected');
  await db.collection('users').updateOne(
    { id: userId },
    { $set: { thumbnail: fileId, updated_at: new Date() } }
  );
}

async function getThumbnail(userId) {
  if (!db) throw new Error('Database not connected');
  const user = await db.collection('users').findOne({ id: userId });
  return user?.thumbnail || null;
}

async function deleteUser(userId) {
  if (!db) throw new Error('Database not connected');
  await db.collection('users').deleteOne({ id: userId });
}

async function getAllUsers() {
  if (!db) throw new Error('Database not connected');
  const users = await db.collection('users').find({}).toArray();
  return users;
}

async function totalUsersCount() {
  if (!db) throw new Error('Database not connected');
  return await db.collection('users').countDocuments({});
}

module.exports = {
  connectMongoDB,
  addUserToDatabase,
  getUploadAsDoc,
  setUploadAsDoc,
  getGenerateSampleVideo,
  setGenerateSampleVideo,
  getGenerateSs,
  setGenerateSs,
  setThumbnail,
  getThumbnail,
  deleteUser,
  getAllUsers,
  totalUsersCount,
};