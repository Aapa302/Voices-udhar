const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const { ensureDefaultShop } = require('./shopController');

/**
 * POST /api/shopkeepers
 * Create a new shopkeeper
 * Public endpoint — no API key required.
 */
const createShopkeeper = async (req, res) => {
  try {
    const body = req.body || {};
    const { shopName, phone, upiId = '', apiKey: providedApiKey, shopkeeperId: providedId } = body;

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
      upiId: typeof upiId === 'string' ? upiId.trim() : '',
      apiKey,
      createdAt: new Date().toISOString(),
    };

    await db.collection('shopkeepers').doc(shopkeeperId).set(shopkeeperData);

    // Auto-create default shop record in shops collection
    await ensureDefaultShop(shopkeeperId, shopName, shopkeeperData.upiId);

    return res.status(201).json({
      message: 'Shopkeeper created successfully',
      shopkeeperId,
      apiKey,
      shopName,
      phone,
      upiId: shopkeeperData.upiId,
      data: shopkeeperData,
    });
  } catch (error) {
    console.error('Error creating shopkeeper:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Unknown error during shopkeeper creation',
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

    if (!id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Shopkeeper ID parameter is required',
      });
    }

    const docRef = db.collection('shopkeepers').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shopkeeper not found',
      });
    }

    const data = doc.data();
    return res.status(200).json({
      data,
      ...data,
    });
  } catch (error) {
    console.error('Error fetching shopkeeper:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Unknown error during fetching shopkeeper',
    });
  }
};

/**
 * PUT /api/shopkeepers/:id
 * Update shopkeeper details (shopName, phone, upiId)
 */
const updateShopkeeper = async (req, res) => {
  try {
    const { id } = req.params;
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;

    if (!id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Shopkeeper ID parameter is required',
      });
    }

    if (id !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Shopkeeper ID parameter does not match authenticated shopkeeper',
      });
    }

    const docRef = db.collection('shopkeepers').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shopkeeper not found',
      });
    }

    const existingData = doc.data();
    const body = req.body || {};

    const shopName = body.shopName !== undefined ? String(body.shopName).trim() : existingData.shopName;
    const phone = body.phone !== undefined ? String(body.phone).trim() : existingData.phone;
    const upiId = body.upiId !== undefined ? String(body.upiId).trim() : (existingData.upiId || '');

    const updatedData = {
      ...existingData,
      shopName,
      phone,
      upiId,
      updatedAt: new Date().toISOString(),
    };

    await docRef.update(updatedData);

    // Also update default shop in shops collection if present
    try {
      const defaultShopRef = db.collection('shops').doc(`shop_${id}`);
      const defaultShopDoc = await defaultShopRef.get();
      if (defaultShopDoc.exists) {
        await defaultShopRef.update({
          shopName,
          upiId,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (sErr) {
      console.warn('Failed to sync updated shopkeeper details to default shop:', sErr.message);
    }

    return res.status(200).json({
      message: 'Shopkeeper updated successfully',
      data: updatedData,
      ...updatedData,
    });
  } catch (error) {
    console.error('Error updating shopkeeper:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Unknown error during updating shopkeeper',
    });
  }
};

module.exports = {
  createShopkeeper,
  getShopkeeper,
  updateShopkeeper,
};
