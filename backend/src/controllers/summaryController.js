const { db } = require('../config/firebase');

/**
 * GET /api/summary/daily/:shopkeeperId
 * Queries today's transactions for the given shopkeeper from Firestore.
 * Returns simple JSON: { totalSales, totalNewUdhaar, totalUdhaarCollected, transactionCount }
 * Designed for text-to-speech friendliness (numbers only).
 */
const getDailySummary = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { shopkeeperId: paramShopkeeperId } = req.params;
    if (paramShopkeeperId && paramShopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    // Compute start and end of today in IST (UTC+5:30)
    const now = new Date();
    const istDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    const startOfTodayIST = new Date(`${istDateStr}T00:00:00.000+05:30`);
    const endOfTodayIST = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);

    const startISO = startOfTodayIST.toISOString();
    const endISO = endOfTodayIST.toISOString();

    const snapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .where('timestamp', '>=', startISO)
      .where('timestamp', '<', endISO)
      .get();

    let totalSales = 0;
    let totalNewUdhaar = 0;
    let totalUdhaarCollected = 0;
    let transactionCount = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      transactionCount++;
      const amount = Number(data.amount) || 0;

      if (data.type === 'sale') {
        totalSales += amount;
      } else if (data.type === 'udhaar_add') {
        totalNewUdhaar += amount;
      } else if (data.type === 'udhaar_paid') {
        totalUdhaarCollected += amount;
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
