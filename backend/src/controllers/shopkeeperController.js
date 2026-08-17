const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/shopkeepers
 * Create a new shopkeeper
 */
const createShopkeeper = async (req, res) => {
  try {
    const { shopName, phone, apiKey: providedApiKey, shopkeeperId: providedId } = req.body;

    if (!shopName || !phone) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopName and phone are required',
      });
    }

    const shopkeeperId = providedId || `sk_${uuidv4()}`;
    const apiKey = providedApiKey || `sk_key_${uuidv4()}`;

    const shopkeeperData = {
      shopkeeperId,
      shopName,
      phone,
      apiKey,
      createdAt: new Date().toISOString(),
    };

    await db.collection('shopkeepers').doc(shopkeeperId).set(shopkeeperData);

    return res.status(201).json({
      message: 'Shopkeeper created successfully',
      data: shopkeeperData,
    });
  } catch (error) {
    console.error('Error creating shopkeeper:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

/**
 * GET /api/shopkeepers/:id
 * Get shopkeeper details by ID
 */
const getShopkeeper = async (req, res) => {
  try {
    const { id } = req.params;

    const docRef = db.collection('shopkeepers').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shopkeeper not found',
      });
    }

    return res.status(200).json({
      data: doc.data(),
    });
  } catch (error) {
    console.error('Error fetching shopkeeper:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

module.exports = {
  createShopkeeper,
  getShopkeeper,
};
