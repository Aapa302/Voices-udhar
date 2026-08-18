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

/**
 * GET /api/summary/trends/:shopkeeperId?period=week|month
 * Queries transactions for the given shopkeeper for the last 7 days (week) or 30 days (month).
 * Aggregates daily sales, new udhaar, and collected udhaar in IST.
 * Returns: { period, dataPoints: [{ date, totalSales, totalNewUdhaar, totalUdhaarCollected }, ...] }
 */
const getSummaryTrends = async (req, res) => {
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

    const period = req.query.period === 'month' ? 'month' : 'week';
    const numDays = period === 'month' ? 30 : 7;

    // Calculate start and end date in IST
    const now = new Date();
    const todayISTStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    const todayISTDate = new Date(`${todayISTStr}T00:00:00.000+05:30`);
    const endDateIST = new Date(todayISTDate.getTime() + 24 * 60 * 60 * 1000);
    const startDateIST = new Date(todayISTDate.getTime() - (numDays - 1) * 24 * 60 * 60 * 1000);

    const startISO = startDateIST.toISOString();
    const endISO = endDateIST.toISOString();

    const snapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .where('timestamp', '>=', startISO)
      .where('timestamp', '<', endISO)
      .get();

    // Map date -> aggregated numbers
    const dailyMap = {};

    // Initialize all days in the date range with 0 totals
    for (let i = 0; i < numDays; i++) {
      const d = new Date(startDateIST.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
      dailyMap[dateStr] = {
        date: dateStr,
        totalSales: 0,
        totalNewUdhaar: 0,
        totalUdhaarCollected: 0,
      };
    }

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!data.timestamp) return;

      const txDate = new Date(data.timestamp);
      const txDateStr = txDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });

      if (dailyMap[txDateStr]) {
        const amount = Number(data.amount) || 0;
        if (data.type === 'sale') {
          dailyMap[txDateStr].totalSales += amount;
        } else if (data.type === 'udhaar_add') {
          dailyMap[txDateStr].totalNewUdhaar += amount;
        } else if (data.type === 'udhaar_paid') {
          dailyMap[txDateStr].totalUdhaarCollected += amount;
        }
      }
    });

    const dataPoints = Object.keys(dailyMap).sort().map((key) => dailyMap[key]);

    return res.status(200).json({
      period,
      dataPoints,
    });
  } catch (error) {
    console.error('Error fetching summary trends:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

module.exports = {
  getDailySummary,
  getSummaryTrends,
};
