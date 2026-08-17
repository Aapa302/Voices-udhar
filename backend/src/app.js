require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const shopkeeperRoutes = require('./routes/shopkeepers');
const customerRoutes = require('./routes/customers');
const transactionRoutes = require('./routes/transactions');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'Voice Udhar Backend' });
});

// API Routes
app.use('/api/shopkeepers', shopkeeperRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/transactions', transactionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Endpoint does not exist' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

module.exports = app;
