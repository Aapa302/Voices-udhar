const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const apiKeyAuth = require('../middleware/auth');

// All customer endpoints require API key auth
router.use(apiKeyAuth);

// POST /api/customers — add/update customer
router.post('/', customerController.addOrUpdateCustomer);

// GET /api/customers/:shopkeeperId — list all customers with udhaar totals
router.get('/:shopkeeperId', customerController.getCustomersByShopkeeper);

module.exports = router;
