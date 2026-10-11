const mongoose = require('mongoose');

// Hide credentials when logging the connection string.
const maskUri = (uri) => uri.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:****@');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and set it.');
  }
  console.log(`[db] Connecting to ${maskUri(uri)} ...`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`[db] Connected to database "${mongoose.connection.name}"`);

  mongoose.connection.on('disconnected', () => console.warn('[db] Disconnected from MongoDB'));
  mongoose.connection.on('error', (err) => console.error('[db] Connection error:', err.message));
}

module.exports = connectDB;
