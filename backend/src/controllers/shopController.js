const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

/**
 * Helper to ensure a shopkeeper has at least one shop document (auto-creates default shop if none exist).
 * Guaranteed not to delete or modify any existing data.
 */
async function ensureDefaultShop(shopkeeperId, defaultShopName = 'My Shop', defaultUpiId = '') {
  if (!shopkeeperId) return null;

  try {
    const snapshot = await db.collection('shops')
      .where('shopkeeperId', '==', shopkeeperId)
      .get();

    if (!snapshot.empty) {
      const shops = [];
      snapshot.forEach((doc) => shops.push({ docId: doc.id, ...doc.data() }));
      return shops[0];
    }

    // Default shopId for existing/legacy users
    const defaultShopId = `shop_${shopkeeperId}`;
    const newShopData = {
      shopId: defaultShopId,
      shopkeeperId,
      shopName: defaultShopName || 'My Shop',
      upiId: defaultUpiId || '',
      isDefault: true,
      createdAt: new Date().toISOString(),
    };

    await db.collection('shops').doc(defaultShopId).set(newShopData);
    return newShopData;
  } catch (err) {
    console.error('Error ensuring default shop:', err);
    return null;
  }
}

/**
 * POST /api/shops
 * Create a new shop under authenticated shopkeeper.
 */
const createShop = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    // Ensure default shop exists first
    await ensureDefaultShop(
      authShopkeeperId,
      req.shopkeeper.shopName || 'My Shop',
      req.shopkeeper.upiId || ''
    );

    const { shopName, upiId = '' } = req.body || {};

    if (!shopName || typeof shopName !== 'string' || !shopName.trim()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopName is required',
      });
    }

    const shopId = `shop_${uuidv4()}`;
    const shopData = {
      shopId,
      shopkeeperId: authShopkeeperId,
      shopName: shopName.trim(),
      upiId: typeof upiId === 'string' ? upiId.trim() : '',
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    await db.collection('shops').doc(shopId).set(shopData);

    return res.status(201).json({
      message: 'Shop created successfully',
      data: shopData,
      ...shopData,
    });
  } catch (error) {
    console.error('Error creating shop:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to create shop',
    });
  }
};

/**
 * GET /api/shops
 * List all shops belonging to authenticated shopkeeper.
 * Automatically ensures at least one default shop exists for legacy users.
 */
const listShops = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const snapshot = await db.collection('shops')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    let shops = [];
    snapshot.forEach((doc) => shops.push({ docId: doc.id, ...doc.data() }));

    if (shops.length === 0) {
      const defaultShop = await ensureDefaultShop(
        authShopkeeperId,
        req.shopkeeper.shopName || 'My Shop',
        req.shopkeeper.upiId || ''
      );
      if (defaultShop) {
        shops = [defaultShop];
      }
    }

    // Sort shops with default shop first, then by createdAt ascending
    shops.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });

    return res.status(200).json({
      data: shops,
    });
  } catch (error) {
    console.error('Error listing shops:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to list shops',
    });
  }
};

/**
 * PUT /api/shops/:shopId
 * Update shop details (shopName, upiId).
 */
const updateShop = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { shopId } = req.params;
    if (!shopId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopId parameter is required',
      });
    }

    const shopRef = db.collection('shops').doc(shopId);
    const shopDoc = await shopRef.get();

    if (!shopDoc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Shop not found',
      });
    }

    const existingData = shopDoc.data();
    if (existingData.shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Shop does not belong to authenticated shopkeeper',
      });
    }

    const { shopName, upiId } = req.body || {};
    const updatedName = shopName !== undefined ? String(shopName).trim() : existingData.shopName;
    const updatedUpi = upiId !== undefined ? String(upiId).trim() : (existingData.upiId || '');

    const updatedData = {
      ...existingData,
      shopName: updatedName,
      upiId: updatedUpi,
      updatedAt: new Date().toISOString(),
    };

    await shopRef.update(updatedData);

    return res.status(200).json({
      message: 'Shop updated successfully',
      data: updatedData,
      ...updatedData,
    });
  } catch (error) {
    console.error('Error updating shop:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to update shop',
    });
  }
};

module.exports = {
  ensureDefaultShop,
  createShop,
  listShops,
  updateShop,
};
