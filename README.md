# Stockwise - Inventory and Data Management System

Course: Web Dev III - Unit 3 (CO3) - Assignment 3 (Lab practical, 2.5 marks)

A REST API for managing a store/warehouse product catalogue, built with **Node.js, Express.js, MongoDB, Mongoose and dotenv only** (the four allowed libraries). It also ships with a small web UI (plain HTML/CSS/JS served by Express - no extra npm packages, no framework, no boilerplate) so you can use the API visually. The UI is optional: the graded part is the API in `src/`.

## Folder structure
```
inventory-system/
├── server.js                  # starts DB + HTTP server
├── .env.example               # copy to .env
├── src/
│   ├── app.js                 # express app, routes, middleware order
│   ├── config/db.js           # MongoDB connection
│   ├── models/Product.js      # Mongoose schema + validation + stockValue virtual
│   ├── controllers/productController.js
│   ├── routes/productRoutes.js
│   ├── middleware/            # errorHandler (404 + central errors), validateObjectId
│   └── utils/                 # queryBuilder (filter/sort/pagination), asyncHandler
├── public/                    # optional UI (index.html, style.css, app.js)
└── scripts/                   # seed.js, check-syntax.js, test-query-builder.js
```

## Setup
Prerequisites: Node.js 18+ and a MongoDB (local Community Server or a free Atlas cluster).

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env -> set MONGODB_URI (local default is already filled in)
npm run seed                # optional: adds 12 demo products (safe to re-run, deletes nothing)
npm start                   # http://localhost:5000  (UI at /, API at /api/products)
```

## API
Base URL: `http://localhost:5000/api`

| Method | Endpoint | Description | Success |
|---|---|---|---|
| POST | `/products` | Create product | 201, product |
| GET | `/products` | List with filter / sort / pagination | 200, `{ total, page, limit, totalPages, count, products }` |
| GET | `/products/:id` | One product | 200, product |
| PUT | `/products/:id` | Update details (send only the fields to change) | 200, product |
| DELETE | `/products/:id` | Delete | 200, `{ message, id }` |
| PATCH | `/products/:id/stock` | Body `{ "change": 10 }` restock, `{ "change": -3 }` sale | 200, `{ message, product }` |
| GET | `/products/low-stock` | quantity <= each product's own `reorderLevel` | 200, `{ count, lowStockItems }` |
| GET | `/products/summary` | Category-wise aggregation | 200, `{ categories, summary }` |

**List query parameters:** `category`, `search` (name or SKU), `minPrice`, `maxPrice`, `sortBy` (name, sku, category, price, quantity, reorderLevel, createdAt, updatedAt), `order` (asc/desc), `page`, `limit` (1-100, default 10).
Example: `GET /api/products?category=Electronics&minPrice=300&sortBy=price&order=asc&page=1&limit=5`

**Errors** always look like `{ "message": "...", "errors": [{ "field", "message" }] }` with: 400 validation / bad query / bad id / insufficient stock, 404 not found (product or route), 409 duplicate SKU, 500 server error (no stack trace is returned).

### Postman examples
POST `/api/products`
```json
{ "name": "Gel Pen Pack of 15", "sku": "STNY-PN-713", "category": "Stationery", "price": 120, "quantity": 40, "reorderLevel": 20, "supplier": "Cello Pens" }
```
PUT `/api/products/<id>` -> `{ "price": 140, "quantity": 60 }`
PATCH `/api/products/<id>/stock` -> `{ "change": 10 }` (then try `-1000` to see the 400 "Insufficient stock")

Quick negative tests: duplicate SKU (409), `"price": -5` (400), `"quantity": 2.5` (400), `GET /api/products/abc` (400), `GET /api/products?minPrice=500&maxPrice=100` (400), `GET /api/nothing` (404).

## How the key requirements are met
- **Schema:** required/trimmed fields, length limits, unique uppercase SKU, price >= 0, quantity and reorderLevel whole numbers >= 0, timestamps, `stockValue` virtual (price x quantity, not stored). Validators also run on PUT (`runValidators`).
- **Safe stock changes:** one atomic `findOneAndUpdate({ _id, quantity: { $gte: -change } }, { $inc: { quantity: change } })` - stock can never go negative, even with simultaneous requests.
- **Low stock:** `find({ $expr: { $lte: ['$quantity', '$reorderLevel'] } })` compares against each product's own level.
- **Summary:** `aggregate([$group, $project, $sort])` returning `totalItems, totalQuantity, totalStockValue, avgPrice` per category.
- **Safe querying:** sort fields are an allowlist, numbers are strictly validated, search text is regex-escaped, array/object query values (`?category[$ne]=x`) are rejected, request bodies are whitelisted field-by-field.
- **Route order:** `/low-stock` and `/summary` are declared before `/:id`.

## Checks
`npm run check` runs a syntax check on every file and 14 offline tests of the query validation (no database needed).

## Suggested demo for the lab evaluation (~5 min)
1. `npm start`, open `/` and show the dashboard (all numbers come from the API).
2. Postman: POST a product (201), POST the same SKU again (409), POST price -5 (400).
3. GET `/api/products` then with `?search=table`, `?category=Electronics&sortBy=price&order=desc`, `?page=2&limit=5`.
4. PUT a price change, PATCH `+10`, then PATCH `-1000` (rejected).
5. GET `/low-stock` and `/summary`; DELETE the product you created; show the unknown-route 404.
6. Open `src/models/Product.js` and `adjustStock` / `getSummary` in the controller to explain schema, atomic update and aggregation.

## Known limitations
- No authentication (not part of the assignment).
- Prices are plain numbers in INR; no multi-currency support.
- `PUT` is a partial update (matches the sample output, where only changed fields are sent).
