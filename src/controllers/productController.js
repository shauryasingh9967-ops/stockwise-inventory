const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { buildProductQuery, QueryError } = require('../utils/queryBuilder');

const ALLOWED_FIELDS = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'supplier'];

// Copy only known fields from the body (blocks $-operators and unknown keys).
function pickFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new QueryError('Request body must be a JSON object');
  }
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

// POST /api/products
exports.createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(pickFields(req.body));
  res.status(201).json(product);
});

// GET /api/products?category=&search=&minPrice=&maxPrice=&sortBy=&order=&page=&limit=
exports.getProducts = asyncHandler(async (req, res) => {
  const { filter, sort, page, limit, skip } = buildProductQuery(req.query);

  const [products, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    count: products.length,
    products,
  });
});

// GET /api/products/:id
exports.getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

// PUT /api/products/:id  (partial update: only the fields sent are changed)
exports.updateProduct = asyncHandler(async (req, res) => {
  const updates = pickFields(req.body);
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: `Send at least one of: ${ALLOWED_FIELDS.join(', ')}` });
  }
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

// DELETE /api/products/:id
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json({ message: 'Product deleted', id: product.id });
});

// PATCH /api/products/:id/stock   body: { "change": 10 } or { "change": -3 }
exports.adjustStock = asyncHandler(async (req, res) => {
  const change = req.body && req.body.change;
  if (typeof change !== 'number' || !Number.isInteger(change) || change === 0) {
    return res.status(400).json({ message: '"change" must be a non-zero whole number (positive = restock, negative = sale)' });
  }
  if (Math.abs(change) > 1e9) {
    return res.status(400).json({ message: '"change" is too large' });
  }

  // Atomic: the filter and $inc happen in one database operation, so the quantity can
  // never go below zero, even with many concurrent requests (no read-modify-write).
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, quantity: { $gte: -change } },
    { $inc: { quantity: change } },
    { new: true }
  );

  if (product) return res.json({ message: 'Stock updated', product });

  // No match: either the product does not exist, or there is not enough stock.
  const existing = await Product.findById(req.params.id).select('quantity name');
  if (!existing) return res.status(404).json({ message: 'Product not found' });
  res.status(400).json({
    message: `Insufficient stock: "${existing.name}" has ${existing.quantity} unit(s), cannot remove ${Math.abs(change)}`,
    available: existing.quantity,
  });
});

// GET /api/products/low-stock  (quantity <= that product's own reorderLevel)
exports.getLowStock = asyncHandler(async (req, res) => {
  const lowStockItems = await Product.find({ $expr: { $lte: ['$quantity', '$reorderLevel'] } }).sort({
    quantity: 1,
    name: 1,
  });
  res.json({ count: lowStockItems.length, lowStockItems });
});

// GET /api/products/summary  (aggregation pipeline, grouped by category)
exports.getSummary = asyncHandler(async (req, res) => {
  const summary = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
        avgPrice: { $avg: '$price' },
      },
    },
    {
      $project: {
        totalItems: 1,
        totalQuantity: 1,
        totalStockValue: { $round: ['$totalStockValue', 2] },
        avgPrice: { $round: ['$avgPrice', 2] },
      },
    },
    { $sort: { totalStockValue: -1, _id: 1 } },
  ]);
  res.json({ categories: summary.length, summary });
});
