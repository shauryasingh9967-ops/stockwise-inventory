// Pure helper (no database needed) that turns req.query into a safe MongoDB filter/sort/page.

const SORT_FIELDS = ['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'createdAt', 'updatedAt'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;

class QueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QueryError';
    this.statusCode = 400;
  }
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Only plain single string values are accepted (blocks ?category[$ne]=x and repeated params).
function single(query, key) {
  const v = query[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new QueryError(`"${key}" must be a single plain value`);
  const t = v.trim();
  return t === '' ? undefined : t;
}

function parseNumber(value, key) {
  if (value === undefined) return undefined;
  if (!/^\d+(\.\d+)?$/.test(value)) throw new QueryError(`"${key}" must be a non-negative number`);
  return Number(value);
}

function parseInteger(value, key, min, max) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new QueryError(`"${key}" must be a whole number`);
  const n = Number(value);
  if (n < min || n > max) throw new QueryError(`"${key}" must be between ${min} and ${max}`);
  return n;
}

function buildProductQuery(query = {}) {
  const filter = {};

  const category = single(query, 'category');
  if (category) filter.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' };

  const search = single(query, 'search');
  if (search) {
    const re = escapeRegex(search);
    filter.$or = [{ name: { $regex: re, $options: 'i' } }, { sku: { $regex: re, $options: 'i' } }];
  }

  const minPrice = parseNumber(single(query, 'minPrice'), 'minPrice');
  const maxPrice = parseNumber(single(query, 'maxPrice'), 'maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new QueryError('"minPrice" cannot be greater than "maxPrice"');
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  const sortBy = single(query, 'sortBy') || 'createdAt';
  if (!SORT_FIELDS.includes(sortBy)) {
    throw new QueryError(`"sortBy" must be one of: ${SORT_FIELDS.join(', ')}`);
  }
  const order = (single(query, 'order') || 'desc').toLowerCase();
  if (order !== 'asc' && order !== 'desc') throw new QueryError('"order" must be "asc" or "desc"');

  const page = parseInteger(single(query, 'page'), 'page', 1, 1e9) || 1;
  const limit = parseInteger(single(query, 'limit'), 'limit', 1, MAX_LIMIT) || DEFAULT_LIMIT;

  return {
    filter,
    // _id as a tie-breaker keeps pagination stable when many rows share the same sort value.
    sort: { [sortBy]: order === 'asc' ? 1 : -1, _id: 1 },
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

module.exports = { buildProductQuery, QueryError, SORT_FIELDS, MAX_LIMIT };
