const { db } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/customers
 * Add or update customer (customerId, shopkeeperId, name, phone, totalUdhaar)
 */
const addOrUpdateCustomer = async (req, res) => {
  try {
    const { customerId: providedCustomerId, shopkeeperId, name, phone, totalUdhaar } = req.body;

    if (!shopkeeperId || !name || !phone) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopkeeperId, name, and phone are required',
      });
    }

    const customerId = providedCustomerId || `cust_${uuidv4()}`;
    const initialUdhaar = typeof totalUdhaar === 'number' ? totalUdhaar : 0;

    const customerRef = db.collection('customers').doc(customerId);
    const existingDoc = await customerRef.get();

    let customerData;
    if (existingDoc.exists) {
      customerData = {
        ...existingDoc.data(),
        shopkeeperId,
        name,
        phone,
        totalUdhaar: typeof totalUdhaar === 'number' ? totalUdhaar : existingDoc.data().totalUdhaar || 0,
        updatedAt: new Date().toISOString(),
      };
      await customerRef.set(customerData, { merge: true });
    } else {
      customerData = {
        customerId,
        shopkeeperId,
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
      data: customerData,
    });
  } catch (error) {
    console.error('Error adding/updating customer:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

/**
 * GET /api/customers/:shopkeeperId
 * List all customers for a given shopkeeper with totalUdhaar
 */
const getCustomersByShopkeeper = async (req, res) => {
  try {
    const { shopkeeperId } = req.params;

    if (!shopkeeperId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopkeeperId parameter is required',
      });
    }

    const snapshot = await db.collection('customers').where('shopkeeperId', '==', shopkeeperId).get();

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
      message: error.message,
    });
  }
};

module.exports = {
  addOrUpdateCustomer,
  getCustomersByShopkeeper,
};
