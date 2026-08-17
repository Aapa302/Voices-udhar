const express = require('express');
const router = express.Router();
const shopkeeperController = require('../controllers/shopkeeperController');

// POST /api/shopkeepers — create shopkeeper (Unprotected so shopkeeper can register)
router.post('/', shopkeeperController.createShopkeeper);

// GET /api/shopkeepers/:id — get shopkeeper details
router.get('/:id', shopkeeperController.getShopkeeper);

module.exports = router;
