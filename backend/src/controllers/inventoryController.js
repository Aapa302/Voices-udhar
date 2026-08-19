const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const { levenshteinDistance, normalizeGujaratiPhonetics } = require('./voiceController');

/**
 * Helper to fuzzy match an item name against an array of existing inventory items.
 */
function findMatchingInventoryItem(targetName, inventoryItems) {
  if (!targetName || !Array.isArray(inventoryItems) || inventoryItems.length === 0) {
    return null;
  }

  const cleanTarget = targetName.trim();
  if (!cleanTarget) return null;

  const normTarget = normalizeGujaratiPhonetics(cleanTarget);

  let bestMatch = null;
  let minDistance = Infinity;

  for (const item of inventoryItems) {
    if (!item || !item.itemName) continue;
    const cleanItemName = item.itemName.trim();

    // Exact match (case insensitive)
    if (cleanTarget.toLowerCase() === cleanItemName.toLowerCase()) {
      return item;
    }

    const normItemName = normalizeGujaratiPhonetics(cleanItemName);

    // Phonetic normalized exact match
    if (normTarget && normTarget.length >= 2 && normTarget === normItemName) {
      return item;
    }

    // Levenshtein distance on normalized strings
    if (normTarget && normItemName) {
      const dist = levenshteinDistance(normTarget, normItemName);
      const maxLen = Math.max(normTarget.length, normItemName.length);

      if (dist <= 2 || (maxLen >= 5 && dist / maxLen <= 0.3)) {
        if (dist < minDistance) {
          minDistance = dist;
          bestMatch = item;
        }
      }
    }
  }

  return bestMatch;
}

/**
 * POST /api/inventory
 * Add a new item or update quantity for an existing item (matched by fuzzy itemName, scoped to req.shopkeeper.shopkeeperId).
 */
const addOrUpdateInventoryItem = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const body = req.body || {};
    const {
      shopkeeperId: providedShopkeeperId,
      itemName,
      quantity,
      unit,
      lowStockThreshold,
      mode = 'add', // 'add' to increment quantity, 'set' to overwrite quantity
    } = body;

    if (providedShopkeeperId && providedShopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    if (!itemName || typeof itemName !== 'string' || !itemName.trim()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'itemName is required',
      });
    }

    const numericQty = quantity !== undefined && quantity !== null ? Number(quantity) : 0;
    if (isNaN(numericQty)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'quantity must be a valid number',
      });
    }

    // Fetch existing inventory for this shopkeeper
    const snapshot = await db
      .collection('inventory')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const existingItems = [];
    snapshot.forEach((doc) => existingItems.push({ docId: doc.id, ...doc.data() }));

    const matchedItem = findMatchingInventoryItem(itemName, existingItems);

    if (matchedItem) {
      // Update existing item
      const itemRef = db.collection('inventory').doc(matchedItem.docId || matchedItem.itemId);
      const existingQty = Number(matchedItem.quantity) || 0;
      const newQty = mode === 'set' ? numericQty : existingQty + numericQty;
      const threshold = lowStockThreshold !== undefined ? Number(lowStockThreshold) : Number(matchedItem.lowStockThreshold || 5);
      const isLowStock = newQty <= threshold;
      const itemUnit = unit || matchedItem.unit || 'piece';
      const lastUpdated = new Date().toISOString();

      const updatedData = {
        quantity: newQty,
        unit: itemUnit,
        lowStockThreshold: threshold,
        isLowStock,
        lastUpdated,
      };

      await itemRef.update(updatedData);

      const fullUpdatedItem = {
        ...matchedItem,
        ...updatedData,
        itemId: matchedItem.itemId || matchedItem.docId,
        shopkeeperId: authShopkeeperId,
      };

      return res.status(200).json({
        message: 'Inventory item updated successfully',
        data: fullUpdatedItem,
        isLowStock,
      });
    } else {
      // Create new item
      const itemId = body.itemId || `item_${uuidv4()}`;
      const threshold = lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5;
      const isLowStock = numericQty <= threshold;
      const itemUnit = unit || 'piece';
      const lastUpdated = new Date().toISOString();

      const newItemData = {
        itemId,
        shopkeeperId: authShopkeeperId,
        itemName: itemName.trim(),
        quantity: numericQty,
        unit: itemUnit,
        lowStockThreshold: threshold,
        isLowStock,
        lastUpdated,
      };

      await db.collection('inventory').doc(itemId).set(newItemData);

      return res.status(201).json({
        message: 'Inventory item created successfully',
        data: newItemData,
        isLowStock,
      });
    }
  } catch (error) {
    console.error('Error adding/updating inventory item:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to add/update inventory item',
    });
  }
};

/**
 * GET /api/inventory/:shopkeeperId
 * List all inventory items for the shopkeeper, sorted with low-stock items first.
 */
const getInventory = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { shopkeeperId } = req.params;

    if (!shopkeeperId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopkeeperId parameter is required',
      });
    }

    if (shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'shopkeeperId parameter does not match authenticated shopkeeper',
      });
    }

    const snapshot = await db
      .collection('inventory')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const items = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const quantity = Number(data.quantity) || 0;
      const lowStockThreshold = Number(data.lowStockThreshold) || 5;
      const isLowStock = data.isLowStock !== undefined ? Boolean(data.isLowStock) : quantity <= lowStockThreshold;

      items.push({
        ...data,
        itemId: data.itemId || doc.id,
        quantity,
        lowStockThreshold,
        isLowStock,
      });
    });

    // Sort with low-stock items first, then alphabetically by itemName
    items.sort((a, b) => {
      const aLow = a.isLowStock ? 1 : 0;
      const bLow = b.isLowStock ? 1 : 0;
      if (aLow !== bLow) {
        return bLow - aLow; // Low stock (1) before normal stock (0)
      }
      return (a.itemName || '').localeCompare(b.itemName || '');
    });

    return res.status(200).json({
      data: items,
    });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to fetch inventory items',
    });
  }
};

/**
 * PUT /api/inventory/:itemId
 * Manually update quantity, lowStockThreshold, unit, or itemName for an item.
 */
const updateInventoryItem = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { itemId } = req.params;
    if (!itemId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'itemId parameter is required',
      });
    }

    const itemRef = db.collection('inventory').doc(itemId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Inventory item not found',
      });
    }

    const existingData = itemDoc.data();
    if (existingData.shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Inventory item does not belong to authenticated shopkeeper',
      });
    }

    const body = req.body || {};
    const newItemName = body.itemName !== undefined ? String(body.itemName).trim() : existingData.itemName;
    const newQuantity = body.quantity !== undefined ? Number(body.quantity) : Number(existingData.quantity || 0);
    const newUnit = body.unit !== undefined ? String(body.unit) : existingData.unit || 'piece';
    const newThreshold = body.lowStockThreshold !== undefined ? Number(body.lowStockThreshold) : Number(existingData.lowStockThreshold || 5);

    if (isNaN(newQuantity)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'quantity must be a valid number',
      });
    }

    if (isNaN(newThreshold)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'lowStockThreshold must be a valid number',
      });
    }

    const isLowStock = newQuantity <= newThreshold;
    const lastUpdated = new Date().toISOString();

    const updatedData = {
      itemName: newItemName,
      quantity: newQuantity,
      unit: newUnit,
      lowStockThreshold: newThreshold,
      isLowStock,
      lastUpdated,
    };

    await itemRef.update(updatedData);

    const fullItemData = {
      ...existingData,
      ...updatedData,
      itemId,
      shopkeeperId: authShopkeeperId,
    };

    return res.status(200).json({
      message: 'Inventory item updated successfully',
      data: fullItemData,
      isLowStock,
    });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to update inventory item',
    });
  }
};

/**
 * DELETE /api/inventory/:itemId
 * Remove an inventory item.
 */
const deleteInventoryItem = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { itemId } = req.params;
    if (!itemId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'itemId parameter is required',
      });
    }

    const itemRef = db.collection('inventory').doc(itemId);
    const itemDoc = await itemRef.get();

    if (!itemDoc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Inventory item not found',
      });
    }

    if (itemDoc.data().shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Inventory item does not belong to authenticated shopkeeper',
      });
    }

    await itemRef.delete();

    return res.status(200).json({
      message: 'Inventory item deleted successfully',
      itemId,
    });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to delete inventory item',
    });
  }
};

module.exports = {
  addOrUpdateInventoryItem,
  getInventory,
  updateInventoryItem,
  deleteInventoryItem,
  findMatchingInventoryItem,
};
