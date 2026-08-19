const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const apiKeyAuth = require('../middleware/auth');

// All reminder endpoints require API key auth
router.use(apiKeyAuth);

// GET /api/reminders/today - get today reminders for authenticated shopkeeper
router.get('/today', customerController.getRemindersToday);

// GET /api/reminders/today/:shopkeeperId - get today reminders for shopkeeper
router.get('/today/:shopkeeperId', customerController.getRemindersToday);

// POST /api/reminders/batch-sent - mark payment reminders as sent for multiple customers
router.post('/batch-sent', customerController.markBatchRemindersSent);

module.exports = router;
