const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

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

    const transactionId = providedId || `tx_${uuidv4()}`;
    const txTimestamp = timestamp || new Date().toISOString();

    const transactionData = {
      transactionId,
      shopkeeperId: authShopkeeperId,
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

    const snapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .where('customerId', '==', customerId)
      .get();

    const transactions = [];
    snapshot.forEach((doc) => {
      transactions.push(doc.data());
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
