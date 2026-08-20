const express = require('express');
const router = express.Router();
const shopkeeperController = require('../controllers/shopkeeperController');
const apiKeyAuth = require('../middleware/auth');

// All shopkeeper routes pass through apiKeyAuth (POST /api/shopkeepers is exempted inside middleware)
router.use(apiKeyAuth);

// POST /api/shopkeepers — create shopkeeper (exempted from API key requirement)
router.post('/', shopkeeperController.createShopkeeper);

// GET /api/shopkeepers/:id — get shopkeeper details (requires x-api-key)
router.get('/:id', shopkeeperController.getShopkeeper);

// PUT /api/shopkeepers/:id — update shopkeeper profile (requires x-api-key)
router.put('/:id', shopkeeperController.updateShopkeeper);

module.exports = router;
