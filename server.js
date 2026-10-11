require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const Product = require('./src/models/Product');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    await Product.init(); // make sure the unique SKU index exists before serving requests
    const server = app.listen(PORT, () => {
      console.log(`[server] Running on http://localhost:${PORT}  (env: ${process.env.NODE_ENV || 'development'})`);
      console.log(`[server] UI:  http://localhost:${PORT}/`);
      console.log(`[server] API: http://localhost:${PORT}/api/products`);
    });

    const shutdown = async () => {
      console.log('\n[server] Shutting down...');
      server.close();
      await mongoose.connection.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error(`[server] Failed to start: ${err.message}`);
    process.exit(1);
  }
}

start();
