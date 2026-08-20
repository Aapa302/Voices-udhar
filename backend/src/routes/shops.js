const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const apiKeyAuth = require('../middleware/auth');

// All shop management routes require API key auth
router.use(apiKeyAuth);

// POST /api/shops — create new shop
router.post('/', shopController.createShop);

// GET /api/shops — list all shops for shopkeeper
router.get('/', shopController.listShops);

// PUT /api/shops/:shopId — update shop details
router.put('/:shopId', shopController.updateShop);

module.exports = router;
