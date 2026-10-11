// Adds 12 demo products. Safe to re-run: existing SKUs are left untouched, nothing is deleted.
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');

const products = [
  { name: 'Study Table', sku: 'FURN-TB-812', category: 'Furniture', price: 3999, quantity: 2, reorderLevel: 4, supplier: 'IKEA India' },
  { name: 'Office Chair', sku: 'FURN-CH-204', category: 'Furniture', price: 6499, quantity: 15, reorderLevel: 5, supplier: 'Godrej Interio' },
  { name: 'Wireless Mouse', sku: 'ELEC-MS-101', category: 'Electronics', price: 799, quantity: 35, reorderLevel: 10, supplier: 'Logitech India' },
  { name: 'Bluetooth Speaker', sku: 'ELEC-SP-330', category: 'Electronics', price: 2499, quantity: 6, reorderLevel: 8, supplier: 'boAt' },
  { name: 'Laptop 15 inch', sku: 'ELEC-LP-550', category: 'Electronics', price: 54999, quantity: 8, reorderLevel: 3, supplier: 'Lenovo India' },
  { name: 'USB-C Cable', sku: 'ELEC-CB-077', category: 'Electronics', price: 349, quantity: 47, reorderLevel: 20, supplier: 'Ambrane' },
  { name: 'Cotton T-Shirt', sku: 'APRL-TS-410', category: 'Apparel', price: 599, quantity: 50, reorderLevel: 15, supplier: 'Fabindia' },
  { name: 'Denim Jeans', sku: 'APRL-JN-222', category: 'Apparel', price: 2199, quantity: 28, reorderLevel: 10, supplier: "Levi's India" },
  { name: 'Spiral Notebook A4', sku: 'STNY-NB-109', category: 'Stationery', price: 85, quantity: 18, reorderLevel: 25, supplier: 'Classmate' },
  { name: 'Highlighter Set', sku: 'STNY-HL-245', category: 'Stationery', price: 150, quantity: 60, reorderLevel: 20, supplier: 'Camlin' },
  { name: 'Basmati Rice 5kg', sku: 'GROC-RC-901', category: 'Groceries', price: 649, quantity: 4, reorderLevel: 10, supplier: 'India Gate' },
  { name: 'Olive Oil 1L', sku: 'GROC-OL-318', category: 'Groceries', price: 899, quantity: 22, reorderLevel: 8, supplier: 'Figaro' },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await Product.init();
    const ops = products.map((p) => ({
      updateOne: { filter: { sku: p.sku }, update: { $setOnInsert: p }, upsert: true },
    }));
    const r = await Product.bulkWrite(ops);
    console.log(`Seed done. Inserted ${r.upsertedCount}, already present ${products.length - r.upsertedCount}.`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
