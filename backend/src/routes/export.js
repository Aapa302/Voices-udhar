const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');
const apiKeyAuth = require('../middleware/auth');

// All export routes require API key auth
router.use(apiKeyAuth);

// GET /api/export/:shopkeeperId?format=excel|pdf
router.get('/:shopkeeperId', exportController.exportData);

module.exports = router;
