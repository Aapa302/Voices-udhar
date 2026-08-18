const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summaryController');
const apiKeyAuth = require('../middleware/auth');

// All summary routes require API key auth
router.use(apiKeyAuth);

// GET /api/summary/daily — get today's summary metrics for authenticated shopkeeper
router.get('/daily', summaryController.getDailySummary);

// GET /api/summary/daily/:shopkeeperId — get today's summary metrics for shopkeeper
router.get('/daily/:shopkeeperId', summaryController.getDailySummary);

// GET /api/summary/trends — get weekly/monthly summary trends for authenticated shopkeeper
router.get('/trends', summaryController.getSummaryTrends);

// GET /api/summary/trends/:shopkeeperId — get weekly/monthly summary trends for shopkeeper
router.get('/trends/:shopkeeperId', summaryController.getSummaryTrends);

module.exports = router;
