const { db } = require('../config/firebase');

/**
 * GET /api/summary/daily/:shopkeeperId
 * Queries today's transactions for the given shopkeeper from Firestore.
 * Returns simple JSON: { totalSales, totalNewUdhaar, totalUdhaarCollected, transactionCount }
 * Designed for text-to-speech friendliness (numbers only).
 */
const getDailySummary = async (req, res) => {
  try {
    const { shopkeeperId } = req.params;

    if (!shopkeeperId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopkeeperId parameter is required',
      });
    }

    const snapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', shopkeeperId)
      .get();

    let totalSales = 0;
    let totalNewUdhaar = 0;
    let totalUdhaarCollected = 0;
    let transactionCount = 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    snapshot.forEach((doc) => {
      const data = doc.data();
      const txTime = data.timestamp ? new Date(data.timestamp) : null;

      // Filter for today's transactions
      if (txTime && txTime >= startOfToday) {
        transactionCount++;
        const amount = Number(data.amount) || 0;

        if (data.type === 'sale') {
          totalSales += amount;
        } else if (data.type === 'udhaar_add') {
          totalNewUdhaar += amount;
        } else if (data.type === 'udhaar_paid') {
          totalUdhaarCollected += amount;
        }
      }
    });

    return res.status(200).json({
      totalSales,
      totalNewUdhaar,
      totalUdhaarCollected,
      transactionCount,
    });
  } catch (error) {
    console.error('Error fetching daily summary:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

module.exports = {
  getDailySummary,
};
