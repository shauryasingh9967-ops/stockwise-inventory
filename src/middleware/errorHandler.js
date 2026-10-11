// 404 for any route that did not match.
const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Centralized error handler: every error ends up here with a consistent JSON shape.
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Mongoose schema validation failed
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  // Wrong type / bad ObjectId cast
  if (err.name === 'CastError') {
    return res.status(400).json({
      message: `Invalid value for "${err.path}"`,
      errors: [{ field: err.path, message: `Invalid value for ${err.path}` }],
    });
  }
  // Duplicate key (unique SKU)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || { value: 1 })[0];
    const value = err.keyValue ? err.keyValue[field] : '';
    return res.status(409).json({
      message: `A product with this ${field} already exists${value ? `: "${value}"` : ''}`,
      errors: [{ field, message: `${field} must be unique` }],
    });
  }
  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body contains invalid JSON' });
  }
  // Errors we raise ourselves (bad query params, bad stock change ...)
  if (err.statusCode && err.statusCode < 500) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  console.error('[error]', err);
  const body = { message: 'Internal server error' };
  if (process.env.NODE_ENV !== 'production') body.detail = err.message; // never leak stack traces
  res.status(500).json(body);
};

module.exports = { notFound, errorHandler };
