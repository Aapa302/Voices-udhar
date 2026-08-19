const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/customers
 * Add or update customer (customerId, shopkeeperId, name, phone, totalUdhaar)
 */
const addOrUpdateCustomer = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const body = req.body || {};
    const { customerId: providedCustomerId, shopkeeperId: providedShopkeeperId, name, phone, totalUdhaar, reminderIntervalDays } = body;

    if (providedShopkeeperId && providedShopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    if (!name || !phone) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name and phone are required',
      });
    }

    const customerId = providedCustomerId || `cust_${uuidv4()}`;
    const initialUdhaar = typeof totalUdhaar === 'number' ? totalUdhaar : 0;

    const customerRef = db.collection('customers').doc(customerId);
    const existingDoc = await customerRef.get();

    if (existingDoc.exists && existingDoc.data().shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot modify customer belonging to another shopkeeper',
      });
    }

    let customerData;
    if (existingDoc.exists) {
      const existingData = existingDoc.data();
      const intervalVal = typeof reminderIntervalDays === 'number' && !isNaN(reminderIntervalDays)
        ? reminderIntervalDays
        : (typeof existingData.reminderIntervalDays === 'number' ? existingData.reminderIntervalDays : 30);

      customerData = {
        ...existingData,
        shopkeeperId: authShopkeeperId,
        name,
        phone,
        totalUdhaar: typeof totalUdhaar === 'number' ? totalUdhaar : existingData.totalUdhaar || 0,
        reminderIntervalDays: intervalVal,
        updatedAt: new Date().toISOString(),
      };
      await customerRef.set(customerData, { merge: true });
    } else {
      const intervalVal = typeof reminderIntervalDays === 'number' && !isNaN(reminderIntervalDays) ? reminderIntervalDays : 30;

      customerData = {
        customerId,
        shopkeeperId: authShopkeeperId,
        name,
        phone,
        totalUdhaar: initialUdhaar,
        reminderIntervalDays: intervalVal,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await customerRef.set(customerData);
    }

    return res.status(200).json({
      message: existingDoc.exists ? 'Customer updated successfully' : 'Customer created successfully',
      customerId,
      shopkeeperId: authShopkeeperId,
      name,
      phone,
      totalUdhaar: customerData.totalUdhaar,
      reminderIntervalDays: customerData.reminderIntervalDays,
      data: customerData,
    });
  } catch (error) {
    console.error('Error adding/updating customer:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to save customer',
    });
  }
};

/**
 * GET /api/customers or GET /api/customers/:shopkeeperId
 * List all customers for the authenticated shopkeeper
 */
const getCustomersByShopkeeper = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { shopkeeperId } = req.params;

    if (shopkeeperId && shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    const snapshot = await db.collection('customers').where('shopkeeperId', '==', authShopkeeperId).get();

    const customers = [];
    snapshot.forEach((doc) => {
      customers.push(doc.data());
    });

    return res.status(200).json({
      data: customers,
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to fetch customer list',
    });
  }
};

/**
 * GET /api/customers/detail/:customerId
 * Get full details for a single customer, scoped to the authenticated shopkeeper
 */
const getSingleCustomer = async (req, res) => {
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

    const customerRef = db.collection('customers').doc(customerId);
    const doc = await customerRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Customer not found',
      });
    }

    const customerData = doc.data();

    if (customerData.shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Unauthorized access to customer details',
      });
    }

    return res.status(200).json({
      data: customerData,
    });
  } catch (error) {
    console.error('Error fetching single customer:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to fetch customer details',
    });
  }
};

/**
 * GET /api/customers/alerts or GET /api/customers/alerts/:shopkeeperId
 * Fetch pending udhaar alerts categorized as highAmount and longPending.
 *
 * Query params:
 *   - days: threshold number of days for long pending udhaar (default 15)
 *   - limit: top max count for high amount list (default 10)
 */
const getCustomerAlerts = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { shopkeeperId } = req.params;
    if (shopkeeperId && shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    const daysThreshold = parseInt(req.query.days, 10) || 15;
    const highLimit = parseInt(req.query.limit, 10) || 10;

    // Fetch all customers for this shopkeeper
    const customersSnapshot = await db
      .collection('customers')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const pendingCustomers = [];
    customersSnapshot.forEach((doc) => {
      const data = doc.data();
      const totalUdhaar = Number(data.totalUdhaar) || 0;
      if (totalUdhaar > 0) {
        pendingCustomers.push({
          ...data,
          totalUdhaar,
        });
      }
    });

    if (pendingCustomers.length === 0) {
      return res.status(200).json({
        highAmount: [],
        longPending: [],
      });
    }

    // Fetch all transactions for this shopkeeper to determine last activity timestamp per customer
    const txSnapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const latestTxMap = {};
    txSnapshot.forEach((doc) => {
      const tx = doc.data();
      if (!tx.customerId || !tx.timestamp) return;

      const txTime = new Date(tx.timestamp).getTime();
      if (isNaN(txTime)) return;

      if (!latestTxMap[tx.customerId] || txTime > latestTxMap[tx.customerId]) {
        latestTxMap[tx.customerId] = txTime;
      }
    });

    const nowMs = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const enrichedCustomers = pendingCustomers.map((cust) => {
      let lastActivityTime = latestTxMap[cust.customerId];

      if (!lastActivityTime) {
        const fallBackIso = cust.updatedAt || cust.createdAt;
        lastActivityTime = fallBackIso ? new Date(fallBackIso).getTime() : nowMs;
      }

      if (isNaN(lastActivityTime)) {
        lastActivityTime = nowMs;
      }

      const diffMs = Math.max(0, nowMs - lastActivityTime);
      const daysSinceLastActivity = Math.floor(diffMs / MS_PER_DAY);

      return {
        ...cust,
        lastActivityTimestamp: new Date(lastActivityTime).toISOString(),
        daysSinceLastActivity,
      };
    });

    // 1. highAmount: sorted by totalUdhaar descending (top highLimit)
    const highAmount = [...enrichedCustomers]
      .sort((a, b) => b.totalUdhaar - a.totalUdhaar)
      .slice(0, highLimit);

    // 2. longPending: customers whose last transaction was > daysThreshold days ago, sorted by oldest activity first (daysSinceLastActivity descending)
    const longPending = enrichedCustomers
      .filter((cust) => cust.daysSinceLastActivity >= daysThreshold)
      .sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);

    return res.status(200).json({
      highAmount,
      longPending,
    });
  } catch (error) {
    console.error('Error fetching customer alerts:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to fetch customer alerts',
    });
  }
};

/**
 * GET /api/customers/reminders or GET /api/customers/reminders/:shopkeeperId
 * Fetch customers needing payment reminders (overdue >= 30 days and no reminder sent in past 7 days)
 */
const getCustomerReminders = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { shopkeeperId } = req.params;
    if (shopkeeperId && shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    const daysThreshold = parseInt(req.query.days, 10) || 30;

    const customersSnapshot = await db
      .collection('customers')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const pendingCustomers = [];
    customersSnapshot.forEach((doc) => {
      const data = doc.data();
      const totalUdhaar = Number(data.totalUdhaar) || 0;
      if (totalUdhaar > 0) {
        pendingCustomers.push({ ...data, totalUdhaar });
      }
    });

    if (pendingCustomers.length === 0) {
      return res.status(200).json({ remindersNeeded: [] });
    }

    const txSnapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const latestTxMap = {};
    txSnapshot.forEach((doc) => {
      const tx = doc.data();
      if (!tx.customerId || !tx.timestamp) return;

      const txTime = new Date(tx.timestamp).getTime();
      if (isNaN(txTime)) return;

      if (!latestTxMap[tx.customerId] || txTime > latestTxMap[tx.customerId]) {
        latestTxMap[tx.customerId] = txTime;
      }
    });

    const nowMs = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const remindersNeeded = [];

    for (const cust of pendingCustomers) {
      // Check lastReminderSentAt tracking (don't re-suggest within 7 days)
      if (cust.lastReminderSentAt) {
        const lastSentMs = new Date(cust.lastReminderSentAt).getTime();
        if (!isNaN(lastSentMs)) {
          const daysSinceLastReminder = Math.floor((nowMs - lastSentMs) / MS_PER_DAY);
          if (daysSinceLastReminder < 7) {
            continue; // Skip if reminder was sent within last 7 days
          }
        }
      }

      let lastActivityTime = latestTxMap[cust.customerId];
      if (!lastActivityTime) {
        const fallBackIso = cust.updatedAt || cust.createdAt;
        lastActivityTime = fallBackIso ? new Date(fallBackIso).getTime() : nowMs;
      }

      if (isNaN(lastActivityTime)) {
        lastActivityTime = nowMs;
      }

      const diffMs = Math.max(0, nowMs - lastActivityTime);
      const daysSinceLastTransaction = Math.floor(diffMs / MS_PER_DAY);

      if (daysSinceLastTransaction >= daysThreshold) {
        const suggestedMessage = `નમસ્તે ${cust.name}, તમારું ₹${cust.totalUdhaar} બાકી છે. કૃપા કરી જલ્દી ચૂકવો. આભાર! 🙏`;
        remindersNeeded.push({
          customerId: cust.customerId,
          name: cust.name,
          phone: cust.phone || '',
          totalUdhaar: cust.totalUdhaar,
          daysSinceLastTransaction,
          suggestedMessage,
        });
      }
    }

    return res.status(200).json({ remindersNeeded });
  } catch (error) {
    console.error('Error fetching customer reminders:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to fetch customer reminders',
    });
  }
};

/**
 * POST /api/customers/:customerId/reminder-sent
 * Mark reminder as sent for customer
 */
const markReminderSent = async (req, res) => {
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

    const customerRef = db.collection('customers').doc(customerId);
    const doc = await customerRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Customer not found',
      });
    }

    if (doc.data().shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Unauthorized access to customer',
      });
    }

    const lastReminderSentAt = new Date().toISOString();
    await customerRef.update({
      lastReminderSentAt,
      updatedAt: lastReminderSentAt,
    });

    return res.status(200).json({
      message: 'Reminder marked as sent successfully',
      customerId,
      lastReminderSentAt,
    });
  } catch (error) {
    console.error('Error marking reminder sent:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to mark reminder sent',
    });
  }
};

/**
 * Helper to check if customer is due for payment reminder.
 * Returns true if (days since last transaction >= reminderIntervalDays) AND (lastReminderSentAt is null OR older than 7 days).
 *
 * @param {Object} customer - Customer object with reminderIntervalDays, lastReminderSentAt, and daysSinceLastTransaction
 * @returns {boolean}
 */
const isDueForReminder = (customer) => {
  if (!customer) return false;

  const interval = typeof customer.reminderIntervalDays === 'number' && !isNaN(customer.reminderIntervalDays)
    ? customer.reminderIntervalDays
    : 30;

  let days = customer.daysSinceLastTransaction;
  if (days === undefined || days === null || isNaN(days)) {
    const nowMs = Date.now();
    const lastActivityIso = customer.lastTransactionTimestamp || customer.lastActivityTimestamp || customer.updatedAt || customer.createdAt;
    const lastActivityTime = lastActivityIso ? new Date(lastActivityIso).getTime() : nowMs;
    const validActivityTime = isNaN(lastActivityTime) ? nowMs : lastActivityTime;
    days = Math.floor(Math.max(0, nowMs - validActivityTime) / (24 * 60 * 60 * 1000));
  }

  if (days < interval) {
    return false;
  }

  if (!customer.lastReminderSentAt) {
    return true;
  }

  const lastSentMs = new Date(customer.lastReminderSentAt).getTime();
  if (isNaN(lastSentMs)) {
    return true;
  }

  const nowMs = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const daysSinceLastReminder = Math.floor((nowMs - lastSentMs) / MS_PER_DAY);

  return daysSinceLastReminder >= 7;
};

/**
 * GET /api/reminders/today or GET /api/reminders/today/:shopkeeperId
 * Fetch customers with totalUdhaar > 0 for this shopkeeper who are due for a reminder according to isDueForReminder().
 * Returns: { remindersToday: [{ customerId, name, phone, totalUdhaar, daysSinceLastTransaction, suggestedMessage }] }
 */
const getRemindersToday = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { shopkeeperId } = req.params;
    if (shopkeeperId && shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Provided shopkeeperId does not match authenticated shopkeeper',
      });
    }

    const customersSnapshot = await db
      .collection('customers')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const pendingCustomers = [];
    customersSnapshot.forEach((doc) => {
      const data = doc.data();
      const totalUdhaar = Number(data.totalUdhaar) || 0;
      if (totalUdhaar > 0) {
        pendingCustomers.push({ ...data, totalUdhaar });
      }
    });

    if (pendingCustomers.length === 0) {
      return res.status(200).json({ remindersToday: [] });
    }

    const txSnapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const latestTxMap = {};
    txSnapshot.forEach((doc) => {
      const tx = doc.data();
      if (!tx.customerId || !tx.timestamp) return;

      const txTime = new Date(tx.timestamp).getTime();
      if (isNaN(txTime)) return;

      if (!latestTxMap[tx.customerId] || txTime > latestTxMap[tx.customerId]) {
        latestTxMap[tx.customerId] = txTime;
      }
    });

    const nowMs = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const remindersToday = [];

    for (const cust of pendingCustomers) {
      let lastActivityTime = latestTxMap[cust.customerId];
      if (!lastActivityTime) {
        const fallBackIso = cust.updatedAt || cust.createdAt;
        lastActivityTime = fallBackIso ? new Date(fallBackIso).getTime() : nowMs;
      }

      if (isNaN(lastActivityTime)) {
        lastActivityTime = nowMs;
      }

      const diffMs = Math.max(0, nowMs - lastActivityTime);
      const daysSinceLastTransaction = Math.floor(diffMs / MS_PER_DAY);

      const customerWithDays = {
        ...cust,
        daysSinceLastTransaction,
      };

      if (isDueForReminder(customerWithDays)) {
        const suggestedMessage = `નમસ્તે ${cust.name}, તમારું ₹${cust.totalUdhaar} બાકી છે. કૃપા કરી જલ્દી ચૂકવો. આભાર! 🙏`;
        remindersToday.push({
          customerId: cust.customerId,
          name: cust.name,
          phone: cust.phone || '',
          totalUdhaar: cust.totalUdhaar,
          daysSinceLastTransaction,
          suggestedMessage,
        });
      }
    }

    return res.status(200).json({ remindersToday });
  } catch (error) {
    console.error('Error fetching today reminders:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to fetch today reminders',
    });
  }
};

/**
 * POST /api/reminders/batch-sent
 * Mark payment reminders as sent for multiple customers in a single batch Firestore write.
 * Body: { customerIds: [...] }
 * Scoped strictly to the authenticated shopkeeper.
 */
const markBatchRemindersSent = async (req, res) => {
  try {
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
    if (!authShopkeeperId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authenticated shopkeeper required',
      });
    }

    const { customerIds } = req.body || {};
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'customerIds must be a non-empty array',
      });
    }

    const uniqueCustomerIds = [...new Set(customerIds.filter((id) => typeof id === 'string' && id.trim()))];

    if (uniqueCustomerIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'customerIds must contain valid customer ID strings',
      });
    }

    const validCustomerRefs = [];
    const updatedCustomerIds = [];

    for (const id of uniqueCustomerIds) {
      const custRef = db.collection('customers').doc(id);
      const doc = await custRef.get();
      if (doc.exists && doc.data().shopkeeperId === authShopkeeperId) {
        validCustomerRefs.push(custRef);
        updatedCustomerIds.push(id);
      }
    }

    const nowIso = new Date().toISOString();

    if (validCustomerRefs.length > 0) {
      const batch = db.batch();
      for (const custRef of validCustomerRefs) {
        batch.update(custRef, {
          lastReminderSentAt: nowIso,
          updatedAt: nowIso,
        });
      }
      await batch.commit();
    }

    return res.status(200).json({
      message: 'Batch reminders marked as sent successfully',
      updatedCount: updatedCustomerIds.length,
      lastReminderSentAt: nowIso,
      updatedCustomerIds,
    });
  } catch (error) {
    console.error('Error marking batch reminders sent:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to mark batch reminders as sent',
    });
  }
};

module.exports = {
  addOrUpdateCustomer,
  getCustomersByShopkeeper,
  getSingleCustomer,
  getCustomerAlerts,
  getCustomerReminders,
  getRemindersToday,
  markReminderSent,
  markBatchRemindersSent,
  isDueForReminder,
};
