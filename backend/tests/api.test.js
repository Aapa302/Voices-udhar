process.env.USE_MOCK_DB = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/config/firebase');

describe('Voice Udhar API Integration Tests', () => {
  let shopkeeperId;
  let apiKey;
  let customerId;

  beforeEach(() => {
    if (db._reset) {
      db._reset();
    }
  });

  describe('Health Check', () => {
    it('GET /health should return 200 OK', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Shopkeepers API', () => {
    it('POST /api/shopkeepers should create a shopkeeper', async () => {
      const res = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Sharma General Store',
          phone: '9876543210',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('shopkeeperId');
      expect(res.body.data).toHaveProperty('apiKey');
      expect(res.body.data.shopName).toBe('Sharma General Store');

      shopkeeperId = res.body.data.shopkeeperId;
      apiKey = res.body.data.apiKey;
    });

    it('GET /api/shopkeepers/:id should retrieve shopkeeper details', async () => {
      // Create first
      const createRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Gupta Kirana',
          phone: '9123456789',
        });

      const id = createRes.body.data.shopkeeperId;

      const getRes = await request(app).get(`/api/shopkeepers/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.shopName).toBe('Gupta Kirana');
    });

    it('GET /api/shopkeepers/:id should return 404 for non-existent shopkeeper', async () => {
      const res = await request(app).get('/api/shopkeepers/non_existent_id');
      expect(res.status).toBe(404);
    });
  });

  describe('API Key Authentication Middleware', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Test Shop',
          phone: '1112223333',
        });
      shopkeeperId = res.body.data.shopkeeperId;
      apiKey = res.body.data.apiKey;
    });

    it('should reject requests without x-api-key header', async () => {
      const res = await request(app).get(`/api/customers/${shopkeeperId}`);
      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid x-api-key header', async () => {
      const res = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', 'invalid-key');
      expect(res.status).toBe(403);
    });
  });

  describe('Customers API', () => {
    beforeEach(async () => {
      const res = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Test Shop',
          phone: '1112223333',
        });
      shopkeeperId = res.body.data.shopkeeperId;
      apiKey = res.body.data.apiKey;
    });

    it('POST /api/customers should create a customer', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          name: 'Ramesh Kumar',
          phone: '9988776655',
          totalUdhaar: 150,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('customerId');
      expect(res.body.data.name).toBe('Ramesh Kumar');
      expect(res.body.data.totalUdhaar).toBe(150);

      customerId = res.body.data.customerId;
    });

    it('GET /api/customers/:shopkeeperId should list customers', async () => {
      await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          name: 'Suresh Verma',
          phone: '9911223344',
          totalUdhaar: 200,
        });

      const res = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Suresh Verma');
    });
  });

  describe('Transactions API', () => {
    beforeEach(async () => {
      const skRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Test Shop',
          phone: '1112223333',
        });
      shopkeeperId = skRes.body.data.shopkeeperId;
      apiKey = skRes.body.data.apiKey;

      const custRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          name: 'Ramesh Kumar',
          phone: '9988776655',
          totalUdhaar: 100,
        });
      customerId = custRes.body.data.customerId;
    });

    it('POST /api/transactions should log udhaar_add transaction and update totalUdhaar', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          customerId,
          type: 'udhaar_add',
          amount: 50,
          items: ['2kg Sugar', '1L Milk'],
          rawVoiceText: 'Ramesh 50 rupees udhaar sugar and milk',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('udhaar_add');
      expect(res.body.data.amount).toBe(50);

      // Verify customer's updated totalUdhaar (100 + 50 = 150)
      const custRes = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      const cust = custRes.body.data.find(c => c.customerId === customerId);
      expect(cust.totalUdhaar).toBe(150);
    });

    it('POST /api/transactions should log udhaar_paid transaction and reduce totalUdhaar', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          customerId,
          type: 'udhaar_paid',
          amount: 40,
          rawVoiceText: 'Ramesh paid 40 rupees',
        });

      expect(res.status).toBe(201);

      // Verify customer's updated totalUdhaar (100 - 40 = 60)
      const custRes = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      const cust = custRes.body.data.find(c => c.customerId === customerId);
      expect(cust.totalUdhaar).toBe(60);
    });

    it('GET /api/transactions/:customerId should return customer transaction history', async () => {
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          customerId,
          type: 'udhaar_add',
          amount: 50,
        });

      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          customerId,
          type: 'udhaar_paid',
          amount: 20,
        });

      const res = await request(app)
        .get(`/api/transactions/${customerId}`)
        .set('x-api-key', apiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
    });
  });
});
