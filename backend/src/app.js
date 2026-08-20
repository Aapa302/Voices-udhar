require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const shopkeeperRoutes = require('./routes/shopkeepers');
const customerRoutes = require('./routes/customers');
const transactionRoutes = require('./routes/transactions');
const voiceRoutes = require('./routes/voice');
const billRoutes = require('./routes/bill');
const summaryRoutes = require('./routes/summary');
const inventoryRoutes = require('./routes/inventory');
const reminderRoutes = require('./routes/reminders');
const exportRoutes = require('./routes/export');
const shopRoutes = require('./routes/shops');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Voice Udhar Backend',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/shopkeepers', shopkeeperRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/bill', billRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/shops', shopRoutes);

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
