const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const apiKeyAuth = require('../middleware/auth');

// All customer endpoints require API key auth
router.use(apiKeyAuth);

// GET /api/customers/alerts — get pending udhaar alerts for authenticated shopkeeper
router.get('/alerts', customerController.getCustomerAlerts);

// GET /api/customers/alerts/:shopkeeperId — get pending udhaar alerts for shopkeeper
router.get('/alerts/:shopkeeperId', customerController.getCustomerAlerts);

// GET /api/customers/detail/:customerId — get single customer details
router.get('/detail/:customerId', customerController.getSingleCustomer);

// POST /api/customers — add/update customer
router.post('/', customerController.addOrUpdateCustomer);

// GET /api/customers — list all customers for authenticated shopkeeper
router.get('/', customerController.getCustomersByShopkeeper);

// GET /api/customers/:shopkeeperId — list all customers with udhaar totals for shopkeeper
router.get('/:shopkeeperId', customerController.getCustomersByShopkeeper);

module.exports = router;
