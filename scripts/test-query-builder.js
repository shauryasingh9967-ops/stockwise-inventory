// Offline tests for the query-string validation (no database needed).
const assert = require('assert');
const { buildProductQuery, QueryError } = require('../src/utils/queryBuilder');

const rejects = (q, label) => {
  assert.throws(() => buildProductQuery(q), QueryError, label);
  console.log('ok  rejects:', label);
};

// defaults
let r = buildProductQuery({});
assert.deepStrictEqual(r.filter, {});
assert.strictEqual(r.page, 1);
assert.strictEqual(r.limit, 10);
assert.strictEqual(r.skip, 0);
assert.deepStrictEqual(r.sort, { createdAt: -1, _id: 1 });
console.log('ok  defaults');

// filters + pagination
r = buildProductQuery({ category: 'Electronics', minPrice: '100', maxPrice: '5000', sortBy: 'price', order: 'asc', page: '3', limit: '5' });
assert.strictEqual(r.filter.price.$gte, 100);
assert.strictEqual(r.filter.price.$lte, 5000);
assert.strictEqual(r.skip, 10);
assert.deepStrictEqual(r.sort, { price: 1, _id: 1 });
console.log('ok  filters, sort, skip');

// regex special characters are escaped
r = buildProductQuery({ search: 'a.*(b' });
assert.strictEqual(r.filter.$or[0].name.$regex, 'a\\.\\*\\(b');
console.log('ok  search is regex-escaped');

rejects({ minPrice: 'abc' }, 'non-numeric minPrice');
rejects({ minPrice: '-5' }, 'negative minPrice');
rejects({ minPrice: '500', maxPrice: '100' }, 'minPrice > maxPrice');
rejects({ sortBy: 'password' }, 'sortBy outside allowlist');
rejects({ order: 'sideways' }, 'bad order');
rejects({ page: '0' }, 'page 0');
rejects({ page: '1.5' }, 'fractional page');
rejects({ limit: '101' }, 'limit above max');
rejects({ limit: 'ten' }, 'non-numeric limit');
rejects({ category: { $ne: 'x' } }, 'operator injection in category (object)');
rejects({ search: ['a', 'b'] }, 'repeated search param (array)');

console.log('\nAll query-builder tests passed.');
