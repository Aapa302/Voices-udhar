const { db } = require('../config/firebase');

/**
 * Middleware to check x-api-key header against shopkeepers collection in Firestore.
 * Exempts POST /api/shopkeepers (public onboarding/registration endpoint) and CORS OPTIONS requests.
 */
const apiKeyAuth = async (req, res, next) => {
  // Always allow CORS preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Exempt POST /api/shopkeepers from x-api-key requirement
  const path = (req.originalUrl || req.url || '').split('?')[0].replace(/\/$/, '');
  const isShopkeeperRegistration = req.method === 'POST' && (path === '/api/shopkeepers' || path === '/api/shopkeepers/');

  if (isShopkeeperRegistration) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required in x-api-key header',
    });
  }

  try {
    const shopkeepersRef = db.collection('shopkeepers');
    const snapshot = await shopkeepersRef.where('apiKey', '==', apiKey).get();

    if (snapshot.empty) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid API key',
      });
    }

    const shopkeeperDoc = snapshot.docs[0];
    req.shopkeeper = {
      shopkeeperId: shopkeeperDoc.id,
      ...shopkeeperDoc.data(),
    };

    return next();
  } catch (error) {
    console.error('API key auth error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate API key',
    });
  }
};

module.exports = apiKeyAuth;
