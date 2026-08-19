const mongoose = require('mongoose');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const connectDB = async (retries = 5, delay = 5000) => {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in environment variables. Skipping DB connect.');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    if (retries > 0) {
      console.log(`Retrying MongoDB connection in ${delay / 1000}s... (${retries} retries left)`);
      await sleep(delay);
      return connectDB(retries - 1, Math.min(delay * 2, 60000));
    }
    console.error('Could not establish MongoDB connection after retries. Continuing without DB (routes may fail).');
  }

  // Reconnect on disconnects
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
    connectDB();
  });
};

module.exports = connectDB;
