// db.js - مدیریت پایگاه داده
const { MongoClient } = require('mongodb');
const config = require('./config');

let db;

async function connectDB() {
  try {
    const client = await MongoClient.connect(config.MONGODB_URI, { 
      useNewUrlParser: true,
      useUnifiedTopology: true 
    });
    db = client.db('video_merge_bot');
    console.log('Connected to MongoDB');
    return db;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

async function getDB() {
  if (!db) await connectDB();
  return db;
}

module.exports = { connectDB, getDB };