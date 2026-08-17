const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const apiKeyAuth = require('../middleware/auth');

// All voice processing routes require API key auth
router.use(apiKeyAuth);

// POST /api/voice/process — process base64 audio with Gemini API
router.post('/process', voiceController.processVoice);

module.exports = router;
