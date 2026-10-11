const express = require('express');
const c = require('../controllers/productController');
const validateObjectId = require('../middleware/validateObjectId');

const router = express.Router();

// Fixed routes MUST come before "/:id", otherwise "low-stock" would be read as an id.
router.get('/low-stock', c.getLowStock);
router.get('/summary', c.getSummary);

router.route('/').post(c.createProduct).get(c.getProducts);

router
  .route('/:id')
  .get(validateObjectId, c.getProductById)
  .put(validateObjectId, c.updateProduct)
  .delete(validateObjectId, c.deleteProduct);

router.patch('/:id/stock', validateObjectId, c.adjustStock);

module.exports = router;
