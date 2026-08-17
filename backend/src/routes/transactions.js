const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const apiKeyAuth = require('../middleware/auth');

// All transaction endpoints require API key auth
router.use(apiKeyAuth);

// POST /api/transactions — log a transaction
router.post('/', transactionController.logTransaction);

// GET /api/transactions/:customerId — get transaction history
router.get('/:customerId', transactionController.getTransactionsByCustomer);

module.exports = router;
