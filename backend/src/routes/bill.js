const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const apiKeyAuth = require('../middleware/auth');

// All bill generation routes require API key auth
router.use(apiKeyAuth);

// POST /api/bill/generate — generate PDF receipt & WhatsApp link
router.post('/generate', billController.generateBill);

module.exports = router;
