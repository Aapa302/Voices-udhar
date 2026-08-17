const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summaryController');
const apiKeyAuth = require('../middleware/auth');

// All summary routes require API key auth
router.use(apiKeyAuth);

// GET /api/summary/daily/:shopkeeperId — get today's summary metrics
router.get('/daily/:shopkeeperId', summaryController.getDailySummary);

module.exports = router;
