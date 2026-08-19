const express = require('express');
const router = express.Router();
const apiKeyAuth = require('../middleware/auth');
const {
  addOrUpdateInventoryItem,
  getInventory,
  updateInventoryItem,
  deleteInventoryItem,
} = require('../controllers/inventoryController');

// All inventory routes require API key authentication
router.use(apiKeyAuth);

router.post('/', addOrUpdateInventoryItem);
router.get('/:shopkeeperId', getInventory);
router.put('/:itemId', updateInventoryItem);
router.delete('/:itemId', deleteInventoryItem);

module.exports = router;
