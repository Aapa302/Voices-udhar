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

    it('GET /api/shopkeepers/:id should require x-api-key header and retrieve shopkeeper details', async () => {
      const createRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Gupta Kirana',
          phone: '9123456789',
        });

      const id = createRes.body.data.shopkeeperId;
      const key = createRes.body.data.apiKey;

      // Without x-api-key should fail with 401
      const unauthorizedRes = await request(app).get(`/api/shopkeepers/${id}`);
      expect(unauthorizedRes.status).toBe(401);

      // With x-api-key should succeed
      const getRes = await request(app)
        .get(`/api/shopkeepers/${id}`)
        .set('x-api-key', key);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.shopName).toBe('Gupta Kirana');
    });

    it('GET /api/shopkeepers/:id should return 404 for non-existent shopkeeper with valid key', async () => {
      const createRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Temp Shop',
          phone: '1234567890',
        });
      const key = createRes.body.data.apiKey;

      const res = await request(app)
        .get('/api/shopkeepers/non_existent_id')
        .set('x-api-key', key);
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
    let otherShopkeeperId, otherApiKey;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Test Shop',
          phone: '1112223333',
        });
      shopkeeperId = res.body.data.shopkeeperId;
      apiKey = res.body.data.apiKey;

      const otherRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Other Shop',
          phone: '9998887776',
        });
      otherShopkeeperId = otherRes.body.data.shopkeeperId;
      otherApiKey = otherRes.body.data.apiKey;
    });

    it('POST /api/customers should create a customer and enforce tenant isolation', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Ramesh Kumar',
          phone: '9988776655',
          totalUdhaar: 150,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('customerId');
      expect(res.body.data.shopkeeperId).toBe(shopkeeperId);
      expect(res.body.data.name).toBe('Ramesh Kumar');
      expect(res.body.data.totalUdhaar).toBe(150);

      customerId = res.body.data.customerId;

      // Reject if shopkeeperId passed in body doesn't match authenticated key
      const badRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId: otherShopkeeperId,
          name: 'Fake Customer',
          phone: '0000000000',
        });
      expect(badRes.status).toBe(403);
    });

    it('GET /api/customers/:shopkeeperId should list customers and enforce tenant isolation', async () => {
      await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Suresh Verma',
          phone: '9911223344',
          totalUdhaar: 200,
        });

      // Request with matching param/key
      const res = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Suresh Verma');

      // Request without param
      const defaultRes = await request(app)
        .get('/api/customers')
        .set('x-api-key', apiKey);
      expect(defaultRes.status).toBe(200);
      expect(defaultRes.body.data.length).toBe(1);

      // Request with mismatching shopkeeperId param
      const forbiddenRes = await request(app)
        .get(`/api/customers/${otherShopkeeperId}`)
        .set('x-api-key', apiKey);
      expect(forbiddenRes.status).toBe(403);
    });

    it('GET /api/customers/detail/:customerId should return single customer details scoped to tenant', async () => {
      const createRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Detail Customer',
          phone: '9898989898',
          totalUdhaar: 500,
        });

      const custId = createRes.body.data.customerId;

      // Owner should access details
      const detailRes = await request(app)
        .get(`/api/customers/detail/${custId}`)
        .set('x-api-key', apiKey);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.name).toBe('Detail Customer');
      expect(detailRes.body.data.totalUdhaar).toBe(500);

      // Mismatching shopkeeper should be forbidden
      const forbiddenRes = await request(app)
        .get(`/api/customers/detail/${custId}`)
        .set('x-api-key', otherApiKey);

      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe('Transactions API', () => {
    let otherShopkeeperId, otherApiKey;

    beforeEach(async () => {
      const skRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Test Shop',
          phone: '1112223333',
        });
      shopkeeperId = skRes.body.data.shopkeeperId;
      apiKey = skRes.body.data.apiKey;

      const otherSkRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Other Shop',
          phone: '2223334444',
        });
      otherShopkeeperId = otherSkRes.body.data.shopkeeperId;
      otherApiKey = otherSkRes.body.data.apiKey;

      const custRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
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
          customerId,
          type: 'udhaar_add',
          amount: 50,
          items: ['2kg Sugar', '1L Milk'],
          rawVoiceText: 'Ramesh 50 rupees udhaar sugar and milk',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('udhaar_add');
      expect(res.body.data.amount).toBe(50);

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
          customerId,
          type: 'udhaar_paid',
          amount: 40,
          rawVoiceText: 'Ramesh paid 40 rupees',
        });

      expect(res.status).toBe(201);

      const custRes = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      const cust = custRes.body.data.find(c => c.customerId === customerId);
      expect(cust.totalUdhaar).toBe(60);
    });

    it('POST /api/transactions should enforce tenant isolation and forbid cross-tenant operations', async () => {
      // Try logging a transaction for Ramesh using another shopkeeper's API key
      const res = await request(app)
        .post('/api/transactions')
        .set('x-api-key', otherApiKey)
        .send({
          customerId,
          type: 'udhaar_add',
          amount: 100,
        });

      expect(res.status).toBe(403);
    });

    it('GET /api/transactions/:customerId should return transaction history and enforce tenant isolation', async () => {
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId,
          type: 'udhaar_add',
          amount: 50,
        });

      const res = await request(app)
        .get(`/api/transactions/${customerId}`)
        .set('x-api-key', apiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);

      // Other shopkeeper cannot get Ramesh's transactions
      const forbiddenRes = await request(app)
        .get(`/api/transactions/${customerId}`)
        .set('x-api-key', otherApiKey);

      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe('Voice Processing API', () => {
    beforeEach(async () => {
      const skRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Test Shop',
          phone: '1112223333',
        });
      shopkeeperId = skRes.body.data.shopkeeperId;
      apiKey = skRes.body.data.apiKey;
    });

    it('POST /api/voice/process should return 400 if audio data is missing', async () => {
      const res = await request(app)
        .post('/api/voice/process')
        .set('x-api-key', apiKey)
        .send({});

      expect(res.status).toBe(400);
    });

    it('POST /api/voice/process should return structured JSON for base64 audio', async () => {
      const dummyAudioBase64 = Buffer.from('mock audio').toString('base64');

      const res = await request(app)
        .post('/api/voice/process')
        .set('x-api-key', apiKey)
        .send({
          audioBase64: dummyAudioBase64,
          mimeType: 'audio/mp3',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('transcription_gujarati');
      expect(res.body).toHaveProperty('translation_english');
      expect(res.body).toHaveProperty('intent');
      expect(res.body).toHaveProperty('customer_name');
      expect(res.body).toHaveProperty('amount');
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('confidence');
    });
  });

  describe('Bill Generation API', () => {
    beforeEach(async () => {
      const skRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Ambika Provision',
          phone: '9876543210',
        });
      shopkeeperId = skRes.body.data.shopkeeperId;
      apiKey = skRes.body.data.apiKey;
    });

    it('POST /api/bill/generate should generate PDF base64 and WhatsApp share link', async () => {
      const res = await request(app)
        .post('/api/bill/generate')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          customerName: 'Patel Bhai',
          customerPhone: '9876543210',
          items: ['Rice 5kg', 'Oil 1L'],
          totalAmount: 450,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pdfBase64');
      expect(res.body).toHaveProperty('whatsappShareLink');
      expect(res.body.whatsappShareLink).toContain('https://wa.me/');
      expect(res.body.shopName).toBe('Ambika Provision');
    });
  });

  describe('Daily Summary API', () => {
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
        });
      customerId = custRes.body.data.customerId;
    });

    it('GET /api/summary/daily/:shopkeeperId should return clean summary metrics for today', async () => {
      const now = new Date().toISOString();

      // Log sale
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({ shopkeeperId, customerId, type: 'sale', amount: 300, timestamp: now });

      // Log udhaar_add
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({ shopkeeperId, customerId, type: 'udhaar_add', amount: 150, timestamp: now });

      // Log udhaar_paid
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({ shopkeeperId, customerId, type: 'udhaar_paid', amount: 50, timestamp: now });

      const res = await request(app)
        .get(`/api/summary/daily/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        totalSales: 300,
        totalNewUdhaar: 150,
        totalUdhaarCollected: 50,
        transactionCount: 3,
      });
    });
  });
});
