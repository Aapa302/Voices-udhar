const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const { findMatchingInventoryItem } = require('./inventoryController');
const { getEffectiveShopId, isDocInShop } = require('../utils/shopHelper');

/**
 * Helper to automatically decrement inventory items when a sale transaction is saved.
 * Performs best-effort fuzzy matching. If no match or error occurs, logs warning and skips without throwing.
 */
async function autoDecrementInventoryOnSale(shopkeeperId, items) {
  if (!shopkeeperId || !items) return;

  try {
    let itemList = [];
    if (typeof items === 'string' && items.trim()) {
      itemList.push({ itemName: items.trim(), quantityToReduce: 1 });
    } else if (Array.isArray(items)) {
      for (const it of items) {
        if (typeof it === 'string' && it.trim()) {
          itemList.push({ itemName: it.trim(), quantityToReduce: 1 });
        } else if (typeof it === 'object' && it !== null) {
          const name = it.name || it.itemName || it.item || '';
          const qty = Number(it.quantity || it.qty || 1);
          if (name && typeof name === 'string' && name.trim()) {
            itemList.push({ itemName: name.trim(), quantityToReduce: isNaN(qty) || qty <= 0 ? 1 : qty });
          }
        }
      }
    }

    if (itemList.length === 0) return;

    const snapshot = await db
      .collection('inventory')
      .where('shopkeeperId', '==', shopkeeperId)
      .get();

    if (snapshot.empty) return;

    const inventoryDocs = [];
    snapshot.forEach((doc) => {
      inventoryDocs.push({ docId: doc.id, ...doc.data() });
    });

    for (const itemToReduce of itemList) {
      const match = findMatchingInventoryItem(itemToReduce.itemName, inventoryDocs);
      if (match) {
        const itemDocId = match.docId || match.itemId;
        const currentQty = Number(match.quantity) || 0;
        const newQty = Math.max(0, currentQty - itemToReduce.quantityToReduce);
        const threshold = Number(match.lowStockThreshold !== undefined ? match.lowStockThreshold : 5);
        const isLowStock = newQty <= threshold;
        const lastUpdated = new Date().toISOString();

        await db.collection('inventory').doc(itemDocId).update({
          quantity: newQty,
          isLowStock,
          lastUpdated,
        });

        // Update in-memory match object for subsequent items in same transaction
        match.quantity = newQty;
        match.isLowStock = isLowStock;
      }
    }
  } catch (err) {
    console.warn('Auto decrement inventory on sale warning:', err.message);
  }
}

/**
 * POST /api/transactions
 * Log a transaction (transactionId, shopkeeperId, customerId, type: "udhaar_add"|"udhaar_paid"|"sale", amount, items, timestamp, rawVoiceText)
 * Also automatically updates customer's totalUdhaar balance.
 */
const logTransaction = async (req, res) => {
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
      transactionId: providedId,
      shopkeeperId: providedShopkeeperId,
      customerId,
      type,
      amount,
      items,
      timestamp,
      rawVoiceText,
    } = body;

    if (providedShopkeeperId && providedShopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    if (!customerId || !type || amount === undefined || amount === null) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'customerId, type, and amount are required',
      });
    }

    const validTypes = ['udhaar_add', 'udhaar_paid', 'sale'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `type must be one of: ${validTypes.join(', ')}`,
      });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'amount must be a non-negative number',
      });
    }

    // Verify customer exists and belongs to authShopkeeperId
    const customerRef = db.collection('customers').doc(customerId);
    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Customer not found',
      });
    }

    if (customerDoc.data().shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Customer does not belong to authenticated shopkeeper',
      });
    }

    const effectiveShopId = getEffectiveShopId(req);
    const transactionId = providedId || `tx_${uuidv4()}`;
    const txTimestamp = timestamp || new Date().toISOString();

    const transactionData = {
      transactionId,
      shopkeeperId: authShopkeeperId,
      shopId: effectiveShopId || `shop_${authShopkeeperId}`,
      customerId,
      type,
      amount: numericAmount,
      items: items || [],
      timestamp: txTimestamp,
      rawVoiceText: rawVoiceText || '',
      detectedLanguage: req.body.detectedLanguage || 'gujarati',
    };

    // Save transaction
    await db.collection('transactions').doc(transactionId).set(transactionData);

    // Update customer's totalUdhaar
    const currentUdhaar = Number(customerDoc.data().totalUdhaar || 0);
    let newUdhaar = currentUdhaar;

    if (type === 'udhaar_add') {
      newUdhaar += numericAmount;
    } else if (type === 'udhaar_paid') {
      newUdhaar -= numericAmount;
    }

    await customerRef.update({
      totalUdhaar: newUdhaar,
      updatedAt: new Date().toISOString(),
    });

    // Auto-decrement inventory if items are present in a sale transaction
    if (type === 'sale' && items && items.length > 0) {
      await autoDecrementInventoryOnSale(authShopkeeperId, items);
    }

    return res.status(201).json({
      message: 'Transaction logged successfully',
      transactionId,
      shopkeeperId: authShopkeeperId,
      customerId,
      type,
      amount: numericAmount,
      data: transactionData,
    });
  } catch (error) {
    console.error('Error logging transaction:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to log transaction',
    });
  }
};

/**
 * GET /api/transactions/:customerId
 * Get transaction history for a customer (scoped to authenticated shopkeeper)
 */
const getTransactionsByCustomer = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'customerId parameter is required',
      });
    }

    // Verify customer exists and belongs to authShopkeeperId
    const customerDoc = await db.collection('customers').doc(customerId).get();

    if (!customerDoc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Customer not found',
      });
    }

    if (customerDoc.data().shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Customer does not belong to authenticated shopkeeper',
      });
    }

    const effectiveShopId = getEffectiveShopId(req);
    const snapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .where('customerId', '==', customerId)
      .get();

    const transactions = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (isDocInShop(data, effectiveShopId, authShopkeeperId)) {
        transactions.push(data);
      }
    });

    return res.status(200).json({
      data: transactions,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to fetch transaction history',
    });
  }
};

module.exports = {
  logTransaction,
  getTransactionsByCustomer,
};
