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
    const { customerId: providedCustomerId, shopkeeperId: providedShopkeeperId, name, phone, totalUdhaar } = body;

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
      customerData = {
        ...existingDoc.data(),
        shopkeeperId: authShopkeeperId,
        name,
        phone,
        totalUdhaar: typeof totalUdhaar === 'number' ? totalUdhaar : existingDoc.data().totalUdhaar || 0,
        updatedAt: new Date().toISOString(),
      };
      await customerRef.set(customerData, { merge: true });
    } else {
      customerData = {
        customerId,
        shopkeeperId: authShopkeeperId,
        name,
        phone,
        totalUdhaar: initialUdhaar,
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

module.exports = {
  addOrUpdateCustomer,
  getCustomersByShopkeeper,
  getSingleCustomer,
};
