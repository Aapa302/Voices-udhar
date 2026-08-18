const path = require('path');
const fs = require('fs');
const { resolveGeminiModel } = require('./config/geminiModelResolver');

/**
 * Validates required environment variables on startup.
 * Logs clear error messages indicating which variable is missing and exits if invalid.
 */
const validateStartupEnv = () => {
  // In test or mock DB / mock gemini mode, bypass strict startup checks if specified
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const missing = [];

  // Check GEMINI_API_KEY
  if (!process.env.GEMINI_API_KEY && process.env.USE_MOCK_GEMINI !== 'true') {
    missing.push('GEMINI_API_KEY');
  }

  // Check Firebase credentials if not using mock DB
  if (process.env.USE_MOCK_DB !== 'true') {
    const hasServiceAccountPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH &&
      fs.existsSync(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));

    const hasIndividualVars =
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY;

    if (!hasServiceAccountPath && !hasIndividualVars) {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.FIREBASE_PROJECT_ID) {
        missing.push('FIREBASE_PROJECT_ID (or FIREBASE_SERVICE_ACCOUNT_PATH)');
      }
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.FIREBASE_CLIENT_EMAIL) {
        missing.push('FIREBASE_CLIENT_EMAIL');
      }
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH && !process.env.FIREBASE_PRIVATE_KEY) {
        missing.push('FIREBASE_PRIVATE_KEY');
      }
    }
  }

  if (missing.length > 0) {
    console.error('====================================================');
    console.error('FATAL STARTUP ERROR: Missing required environment variable(s):');
    missing.forEach((varName) => console.error(`  - ${varName}`));
    console.error('Please configure the above variables in your environment or .env file before starting the server.');
    console.error('====================================================');
    process.exit(1);
  }
};

validateStartupEnv();

const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Voice Udhar Backend running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'test') {
    try {
      await resolveGeminiModel();
    } catch (err) {
      console.warn('[Gemini] Startup model auto-detection error:', err.message);
    }
  }
});
