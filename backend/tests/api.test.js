process.env.USE_MOCK_DB = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/config/firebase');
const {
  levenshteinDistance,
  normalizeGujaratiPhonetics,
  findSuggestedCustomerName,
} = require('../src/controllers/voiceController');
const { isDueForReminder } = require('../src/controllers/customerController');

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

    it('POST /api/customers should create a customer, store reminderIntervalDays default, and enforce tenant isolation', async () => {
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
      expect(res.body.data.reminderIntervalDays).toBe(30);

      customerId = res.body.data.customerId;

      // Custom reminderIntervalDays
      const customRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Custom Interval Customer',
          phone: '9876500000',
          totalUdhaar: 200,
          reminderIntervalDays: 14,
        });

      expect(customRes.status).toBe(200);
      expect(customRes.body.data.reminderIntervalDays).toBe(14);

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

    it('GET /api/customers/alerts/:shopkeeperId should return highAmount and longPending categorized lists', async () => {
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Customer 1: High amount (1000), recent activity (2 days ago)
      const c1Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'High Amount Recent',
          phone: '9876543210',
          totalUdhaar: 1000,
        });
      const c1Id = c1Res.body.data.customerId;
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId: c1Id,
          type: 'udhaar_add',
          amount: 1000,
          timestamp: new Date(now - 2 * MS_PER_DAY).toISOString(),
        });

      // Customer 2: Moderate amount (500), long pending activity (20 days ago)
      const c2Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Long Pending Customer',
          phone: '9123456789',
          totalUdhaar: 500,
        });
      const c2Id = c2Res.body.data.customerId;
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId: c2Id,
          type: 'udhaar_add',
          amount: 500,
          timestamp: new Date(now - 20 * MS_PER_DAY).toISOString(),
        });

      // Customer 3: Zero balance customer (should not be included in alerts)
      await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Zero Balance',
          phone: '9000000000',
          totalUdhaar: 0,
        });

      const res = await request(app)
        .get(`/api/customers/alerts/${shopkeeperId}?days=15`)
        .set('x-api-key', apiKey);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('highAmount');
      expect(res.body).toHaveProperty('longPending');

      // highAmount should have 2 customers sorted by amount descending
      expect(res.body.highAmount.length).toBe(2);
      expect(res.body.highAmount[0].name).toBe('High Amount Recent');
      expect(res.body.highAmount[1].name).toBe('Long Pending Customer');

      // longPending should have only Customer 2 (>= 15 days)
      expect(res.body.longPending.length).toBe(1);
      expect(res.body.longPending[0].name).toBe('Long Pending Customer');
      expect(res.body.longPending[0].daysSinceLastActivity).toBeGreaterThanOrEqual(15);

      // Verify tenant isolation
      const forbiddenRes = await request(app)
        .get(`/api/customers/alerts/${otherShopkeeperId}`)
        .set('x-api-key', apiKey);
      expect(forbiddenRes.status).toBe(403);
    });

    it('GET /api/reminders/today/:shopkeeperId should fetch due reminders with custom/default intervals and 7-day cooldown', async () => {
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Customer 1: Default 30 days interval, last activity 35 days ago (DUE)
      const c1Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Overdue Customer 1',
          phone: '9876543210',
          totalUdhaar: 0,
          reminderIntervalDays: 30,
        });
      const c1Id = c1Res.body.data.customerId;
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId: c1Id,
          type: 'udhaar_add',
          amount: 500,
          timestamp: new Date(now - 35 * MS_PER_DAY).toISOString(),
        });

      // Customer 2: Custom 15 days interval, last activity 20 days ago (DUE)
      const c2Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Overdue Customer 2',
          phone: '9123456789',
          totalUdhaar: 0,
          reminderIntervalDays: 15,
        });
      const c2Id = c2Res.body.data.customerId;
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId: c2Id,
          type: 'udhaar_add',
          amount: 300,
          timestamp: new Date(now - 20 * MS_PER_DAY).toISOString(),
        });

      // Customer 3: 30 days interval, last activity 10 days ago (NOT DUE)
      const c3Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Recent Customer 3',
          phone: '9000000001',
          totalUdhaar: 0,
          reminderIntervalDays: 30,
        });
      const c3Id = c3Res.body.data.customerId;
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId: c3Id,
          type: 'udhaar_add',
          amount: 400,
          timestamp: new Date(now - 10 * MS_PER_DAY).toISOString(),
        });

      // Fetch today reminders
      const remRes = await request(app)
        .get(`/api/reminders/today/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      expect(remRes.status).toBe(200);
      expect(remRes.body).toHaveProperty('remindersToday');
      expect(remRes.body.remindersToday.length).toBe(2);

      const names = remRes.body.remindersToday.map(r => r.name);
      expect(names).toContain('Overdue Customer 1');
      expect(names).toContain('Overdue Customer 2');
      expect(names).not.toContain('Recent Customer 3');

      // Verify suggestedMessage format
      const c1Rem = remRes.body.remindersToday.find(r => r.customerId === c1Id);
      expect(c1Rem.suggestedMessage).toContain('Overdue Customer 1');
      expect(c1Rem.suggestedMessage).toContain('500');

      // Mark reminder sent for Customer 1
      await request(app)
        .post(`/api/customers/${c1Id}/reminder-sent`)
        .set('x-api-key', apiKey);

      // Fetch today reminders again (Customer 1 should now be filtered out due to 7-day cooldown)
      const remRes2 = await request(app)
        .get(`/api/reminders/today/${shopkeeperId}`)
        .set('x-api-key', apiKey);

      expect(remRes2.status).toBe(200);
      expect(remRes2.body.remindersToday.length).toBe(1);
      expect(remRes2.body.remindersToday[0].customerId).toBe(c2Id);

      // Verify GET /api/reminders/today without shopkeeperId param
      const defaultParamRes = await request(app)
        .get('/api/reminders/today')
        .set('x-api-key', apiKey);
      expect(defaultParamRes.status).toBe(200);
      expect(defaultParamRes.body.remindersToday.length).toBe(1);

      // Verify tenant isolation
      const forbiddenRes = await request(app)
        .get(`/api/reminders/today/${otherShopkeeperId}`)
        .set('x-api-key', apiKey);
      expect(forbiddenRes.status).toBe(403);
    });

    it('POST /api/reminders/batch-sent should mark reminders sent in batch and enforce tenant isolation', async () => {
      // Create 2 customers for primary shopkeeper
      const c1Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({ name: 'Batch Cust 1', phone: '9990001111' });
      const c1Id = c1Res.body.data.customerId;

      const c2Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({ name: 'Batch Cust 2', phone: '9990002222' });
      const c2Id = c2Res.body.data.customerId;

      // Create 1 customer for other shopkeeper
      const cOtherRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', otherApiKey)
        .send({ name: 'Other Cust', phone: '9990003333' });
      const cOtherId = cOtherRes.body.data.customerId;

      // Bad request test
      const badRes = await request(app)
        .post('/api/reminders/batch-sent')
        .set('x-api-key', apiKey)
        .send({ customerIds: [] });
      expect(badRes.status).toBe(400);

      // Batch send attempt with mixed customer IDs
      const batchRes = await request(app)
        .post('/api/reminders/batch-sent')
        .set('x-api-key', apiKey)
        .send({ customerIds: [c1Id, c2Id, cOtherId] });

      expect(batchRes.status).toBe(200);
      expect(batchRes.body.updatedCount).toBe(2);
      expect(batchRes.body.updatedCustomerIds).toContain(c1Id);
      expect(batchRes.body.updatedCustomerIds).toContain(c2Id);
      expect(batchRes.body.updatedCustomerIds).not.toContain(cOtherId);

      // Verify customer 1 and customer 2 details have lastReminderSentAt updated
      const detail1 = await request(app)
        .get(`/api/customers/detail/${c1Id}`)
        .set('x-api-key', apiKey);
      expect(detail1.body.data).toHaveProperty('lastReminderSentAt');

      // Verify other shopkeeper customer was NOT updated
      const detailOther = await request(app)
        .get(`/api/customers/detail/${cOtherId}`)
        .set('x-api-key', otherApiKey);
      expect(detailOther.body.data.lastReminderSentAt).toBeUndefined();
    });

    it('GET /api/customers/reminders/:shopkeeperId and POST /api/customers/:customerId/reminder-sent should handle smart reminders flow', async () => {
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // Customer with 35 days pending udhaar
      const cRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Old Udhaar Customer',
          phone: '9876543210',
          totalUdhaar: 0,
        });
      const cId = cRes.body.data.customerId;
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId: cId,
          type: 'udhaar_add',
          amount: 800,
          timestamp: new Date(now - 35 * MS_PER_DAY).toISOString(),
        });

      // Fetch reminders
      const remRes = await request(app)
        .get(`/api/customers/reminders/${shopkeeperId}?days=30`)
        .set('x-api-key', apiKey);

      expect(remRes.status).toBe(200);
      expect(remRes.body).toHaveProperty('remindersNeeded');
      expect(remRes.body.remindersNeeded.length).toBe(1);
      expect(remRes.body.remindersNeeded[0].name).toBe('Old Udhaar Customer');
      expect(remRes.body.remindersNeeded[0].suggestedMessage).toContain('800');

      // Mark reminder sent
      const sentRes = await request(app)
        .post(`/api/customers/${cId}/reminder-sent`)
        .set('x-api-key', apiKey);

      expect(sentRes.status).toBe(200);
      expect(sentRes.body).toHaveProperty('lastReminderSentAt');

      // Subsequent fetch within 7 days should skip this customer
      const remRes2 = await request(app)
        .get(`/api/customers/reminders/${shopkeeperId}?days=30`)
        .set('x-api-key', apiKey);

      expect(remRes2.status).toBe(200);
      expect(remRes2.body.remindersNeeded.length).toBe(0);
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

    it('POST /api/transactions should log udhaar_add transaction, update totalUdhaar, and store detectedLanguage', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId,
          type: 'udhaar_add',
          amount: 50,
          items: ['2kg Sugar', '1L Milk'],
          rawVoiceText: 'Ramesh 50 rupees udhaar sugar and milk',
          detectedLanguage: 'mixed',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe('udhaar_add');
      expect(res.body.data.amount).toBe(50);
      expect(res.body.data.detectedLanguage).toBe('mixed');

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

  describe('isDueForReminder Helper Unit Tests', () => {
    it('returns true if daysSinceLastTransaction >= reminderIntervalDays and lastReminderSentAt is null', () => {
      const customer = {
        reminderIntervalDays: 30,
        daysSinceLastTransaction: 35,
        lastReminderSentAt: null,
      };
      expect(isDueForReminder(customer)).toBe(true);
    });

    it('returns false if daysSinceLastTransaction < reminderIntervalDays', () => {
      const customer = {
        reminderIntervalDays: 30,
        daysSinceLastTransaction: 15,
        lastReminderSentAt: null,
      };
      expect(isDueForReminder(customer)).toBe(false);
    });

    it('returns false if lastReminderSentAt was within 7 days', () => {
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      const customer = {
        reminderIntervalDays: 30,
        daysSinceLastTransaction: 40,
        lastReminderSentAt: new Date(now - 3 * MS_PER_DAY).toISOString(),
      };
      expect(isDueForReminder(customer)).toBe(false);
    });

    it('returns true if lastReminderSentAt was 7 or more days ago', () => {
      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      const customer = {
        reminderIntervalDays: 30,
        daysSinceLastTransaction: 40,
        lastReminderSentAt: new Date(now - 8 * MS_PER_DAY).toISOString(),
      };
      expect(isDueForReminder(customer)).toBe(true);
    });

    it('defaults reminderIntervalDays to 30 if missing or invalid', () => {
      const customer = {
        daysSinceLastTransaction: 31,
        lastReminderSentAt: null,
      };
      expect(isDueForReminder(customer)).toBe(true);

      const customer2 = {
        reminderIntervalDays: 'invalid',
        daysSinceLastTransaction: 25,
        lastReminderSentAt: null,
      };
      expect(isDueForReminder(customer2)).toBe(false);
    });

    it('returns false for null or undefined customer', () => {
      expect(isDueForReminder(null)).toBe(false);
      expect(isDueForReminder(undefined)).toBe(false);
    });
  });

  describe('Voice Processing & Gujarati Phonetic Matching Unit Tests', () => {
    describe('normalizeGujaratiPhonetics', () => {
      it('normalizes common Gujarati consonant confusion pairs', () => {
        expect(normalizeGujaratiPhonetics('ભરત')).toBe('બરત');
        expect(normalizeGujaratiPhonetics('બળવંત')).toBe('બળવંત');
        expect(normalizeGujaratiPhonetics('રમણભાઈ')).toBe('રમણ');
      });
    });

    describe('levenshteinDistance', () => {
      it('computes correct edit distance', () => {
        expect(levenshteinDistance('રમેશ', 'રમેશ')).toBe(0);
        expect(levenshteinDistance('રમેશ', 'રામેશ')).toBe(1);
        expect(levenshteinDistance('સુરેશ', 'રમેશ')).toBe(3);
      });
    });

    describe('findSuggestedCustomerName', () => {
      it('identifies close phonetic matches against existing customer list', () => {
        const existing = ['ભરત પટેલ', 'રમેશ ભાઈ', 'સુરેશ'];
        // 'બરાત પટેલ' -> normalized matches 'ભરત પટેલ'
        expect(findSuggestedCustomerName('બરાત પટેલ', existing)).toBe('ભરત પટેલ');
      });

      it('returns null if there is an exact match or no close match', () => {
        const existing = ['રમેશ'];
        expect(findSuggestedCustomerName('રમેશ', existing)).toBeNull();
        expect(findSuggestedCustomerName('વિક્રમ', existing)).toBeNull();
      });

      it('does NOT match clearly different names such as Bhagubhai vs Valkubhai', () => {
        const existingGujarati = ['વાળકુભાઈ', 'રમેશ'];
        expect(findSuggestedCustomerName('ભાગુભાઈ', existingGujarati)).toBeNull();

        const existingEnglish = ['Valkubhai', 'Ramesh'];
        expect(findSuggestedCustomerName('Bhagubhai', existingEnglish)).toBeNull();
      });
    });

    describe('POST /api/voice/process', () => {
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

      it('should return 400 if audio data is missing', async () => {
        const res = await request(app)
          .post('/api/voice/process')
          .set('x-api-key', apiKey)
          .send({});

        expect(res.status).toBe(400);
      });

      it('should return structured JSON with name confidence, suggested customer name, and detectedLanguage', async () => {
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
        expect(res.body).toHaveProperty('name_confidence');
        expect(res.body).toHaveProperty('amount');
        expect(res.body).toHaveProperty('items');
        expect(res.body).toHaveProperty('detectedLanguage');
        expect(res.body).toHaveProperty('confidence');
      });
    });

    describe('POST /api/voice/query', () => {
      beforeEach(async () => {
        const skRes = await request(app)
          .post('/api/shopkeepers')
          .send({
            shopName: 'Test Shop',
            phone: '1112223333',
          });
        shopkeeperId = skRes.body.data.shopkeeperId;
        apiKey = skRes.body.data.apiKey;

        await request(app)
          .post('/api/customers')
          .set('x-api-key', apiKey)
          .send({
            shopkeeperId,
            name: 'Ramesh Kumar',
            phone: '9988776655',
            totalUdhaar: 500,
          });
      });

      it('should return 400 if audio data is missing', async () => {
        const res = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({});

        expect(res.status).toBe(400);
      });

      it('should handle customer_balance query and return natural spoken Gujarati & English response', async () => {
        const dummyAudioBase64 = Buffer.from('Ramesh balance query').toString('base64');

        const res = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudioBase64,
            mockQueryType: 'customer_balance',
            mockCustomerName: 'Ramesh Kumar',
          });

        expect(res.status).toBe(200);
        expect(res.body.isQuery).toBe(true);
        expect(res.body.queryType).toBe('customer_balance');
        expect(res.body.answerText).toContain('500');
        expect(res.body.answerTextEnglish).toContain('500');
      });

      it('should handle customer_history query and return full transaction history summary', async () => {
        // Create transactions for Ramesh
        const custRes = await request(app)
          .get(`/api/customers/${shopkeeperId}`)
          .set('x-api-key', apiKey);
        const ramesh = custRes.body.data.find(c => c.name === 'Ramesh Kumar');

        await request(app)
          .post('/api/transactions')
          .set('x-api-key', apiKey)
          .send({
            customerId: ramesh.customerId,
            type: 'udhaar_add',
            amount: 600,
            timestamp: new Date('2026-03-01T10:00:00Z').toISOString(),
          });

        await request(app)
          .post('/api/transactions')
          .set('x-api-key', apiKey)
          .send({
            customerId: ramesh.customerId,
            type: 'udhaar_paid',
            amount: 100,
            timestamp: new Date('2026-03-02T10:00:00Z').toISOString(),
          });

        const dummyAudioBase64 = Buffer.from('Ramesh history query').toString('base64');

        const res = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudioBase64,
            mockQueryType: 'customer_history',
            mockCustomerName: 'Ramesh Kumar',
          });

        expect(res.status).toBe(200);
        expect(res.body.isQuery).toBe(true);
        expect(res.body.queryType).toBe('customer_history');
        expect(res.body.answerText).toContain('600');
        expect(res.body.answerText).toContain('100');
      });

      it('should handle inventory_status query for specific item and general list', async () => {
        // Add inventory items
        await request(app)
          .post('/api/inventory')
          .set('x-api-key', apiKey)
          .send({ itemName: 'Parle-G', quantity: 15, unit: 'packet' });

        await request(app)
          .post('/api/inventory')
          .set('x-api-key', apiKey)
          .send({ itemName: 'Amul Milk', quantity: 8, unit: 'liter' });

        // Query specific item
        const dummyAudio1 = Buffer.from('Parle-G stock query').toString('base64');
        const itemRes = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudio1,
            mockQueryType: 'inventory_status',
            mockItemName: 'Parle-G',
          });

        expect(itemRes.status).toBe(200);
        expect(itemRes.body.isQuery).toBe(true);
        expect(itemRes.body.queryType).toBe('inventory_status');
        expect(itemRes.body.answerText).toContain('Parle-G 15 packet');

        // Query general inventory
        const dummyAudio2 = Buffer.from('all inventory query').toString('base64');
        const generalRes = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudio2,
            mockQueryType: 'inventory_status',
          });

        expect(generalRes.status).toBe(200);
        expect(generalRes.body.isQuery).toBe(true);
        expect(generalRes.body.queryType).toBe('inventory_status');
        expect(generalRes.body.answerText).toContain('કુલ 2 વસ્તુઓ છે');
      });

      it('should handle inventory_low_stock query and list items below lowStockThreshold', async () => {
        await request(app)
          .post('/api/inventory')
          .set('x-api-key', apiKey)
          .send({ itemName: 'Tea Powder', quantity: 2, lowStockThreshold: 5, unit: 'kg' });

        const dummyAudio = Buffer.from('low stock query').toString('base64');
        const res = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudio,
            mockQueryType: 'inventory_low_stock',
          });

        expect(res.status).toBe(200);
        expect(res.body.isQuery).toBe(true);
        expect(res.body.queryType).toBe('inventory_low_stock');
        expect(res.body.answerText).toContain('Tea Powder');
      });

      it('should handle general query fallback response', async () => {
        const dummyAudio = Buffer.from('general query').toString('base64');
        const res = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudio,
            mockQueryType: 'general',
          });

        expect(res.status).toBe(200);
        expect(res.body.isQuery).toBe(true);
        expect(res.body.queryType).toBe('general');
        expect(res.body.answerText).toContain('શું તમે કોઈ ચોક્કસ ગ્રાહક');
      });

      it('should handle daily_summary query and return total summary response', async () => {
        const dummyAudioBase64 = Buffer.from('summary query').toString('base64');

        const res = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudioBase64,
            mockQueryType: 'daily_summary',
          });

        expect(res.status).toBe(200);
        expect(res.body.isQuery).toBe(true);
        expect(res.body.queryType).toBe('daily_summary');
        expect(res.body.answerText).toContain('આજનું કુલ વેચાણ');
      });

      it('should return redirection warning if classified as transaction', async () => {
        const dummyAudioBase64 = Buffer.from('mock_transaction').toString('base64');

        const res = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: dummyAudioBase64,
            isMockTransaction: true,
          });

        expect(res.status).toBe(200);
        expect(res.body.isQuery).toBe(false);
        expect(res.body.message).toContain('ટ્રાન્ઝેક્શન મોડનો ઉપયોગ કરો');
      });

      it('should handle top_debtor, debtor_count, and total_outstanding customer balance queries', async () => {
        // Add second customer with higher balance
        await request(app)
          .post('/api/customers')
          .set('x-api-key', apiKey)
          .send({
            shopkeeperId,
            name: 'Suresh Bhai',
            phone: '9876543210',
            totalUdhaar: 1500,
          });

        // Top debtor query
        const resTop = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('sabse zyada udhaar kiska hai top_debtor').toString('base64'),
          });

        expect(resTop.status).toBe(200);
        expect(resTop.body.isQuery).toBe(true);
        expect(resTop.body.queryType).toBe('customer_balance');
        expect(resTop.body.answerText).toContain('Suresh Bhai');
        expect(resTop.body.answerText).toContain('1500');

        // Debtor count query
        const resCount = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('kitne customers udhaar par hai debtor_count').toString('base64'),
          });

        expect(resCount.status).toBe(200);
        expect(resCount.body.answerText).toContain('2');

        // Total outstanding query
        const resTotal = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('total kitna udhaar bakaya hai total_outstanding').toString('base64'),
          });

        expect(resTotal.status).toBe(200);
        expect(resTotal.body.answerText).toContain('2000'); // 500 + 1500
      });

      it('should handle sales comparison and best day queries under daily_summary', async () => {
        const resComp = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('kal se aaj zyada vechaan hua comparison').toString('base64'),
          });

        expect(resComp.status).toBe(200);
        expect(resComp.body.isQuery).toBe(true);
        expect(resComp.body.queryType).toBe('daily_summary');

        const resBest = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('is hafte ka best din kaunsa tha best_day').toString('base64'),
          });

        expect(resBest.status).toBe(200);
        expect(resBest.body.isQuery).toBe(true);
      });

      it('should handle out_of_stock and best_selling queries under inventory_status', async () => {
        // Add out of stock item
        await request(app)
          .post('/api/inventory')
          .set('x-api-key', apiKey)
          .send({ itemName: 'Sugar 1kg', quantity: 0 });

        const resOut = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('kitne items khatam thai gaya out_of_stock').toString('base64'),
          });

        expect(resOut.status).toBe(200);
        expect(resOut.body.isQuery).toBe(true);
        expect(resOut.body.answerText).toContain('Sugar 1kg');

        const resBestSelling = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('sabse zyada bikta hua item best_selling').toString('base64'),
          });

        expect(resBestSelling.status).toBe(200);
        expect(resBestSelling.body.isQuery).toBe(true);
      });

      it('should handle multi-turn conversation memory and pronoun resolution for follow-up questions', async () => {
        // Turn 1: Ask about Ramesh's balance
        const resTurn1 = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('Ramesh ka kitna udhaar hai').toString('base64'),
            mockQueryType: 'customer_balance',
            mockCustomerName: 'Ramesh Kumar',
          });

        expect(resTurn1.status).toBe(200);
        expect(resTurn1.body.isQuery).toBe(true);
        expect(resTurn1.body.customer_name).toBe('Ramesh Kumar');

        // Turn 2: Ask follow-up "aur uska phone number kya hai?" without repeating the customer name
        const resTurn2 = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('aur uska phone number kya hai').toString('base64'),
            mockSubType: 'phone_number',
          });

        expect(resTurn2.status).toBe(200);
        expect(resTurn2.body.isQuery).toBe(true);
        expect(resTurn2.body.customer_name).toBe('Ramesh Kumar');
        expect(resTurn2.body.answerText).toContain('Ramesh Kumar');
        expect(resTurn2.body.answerText).toContain('9988776655');

        // Turn 3: Topic change to Suresh
        const resTurn3 = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('Suresh ka kitna udhaar hai').toString('base64'),
            mockQueryType: 'customer_balance',
            mockCustomerName: 'Suresh Bhai',
          });

        expect(resTurn3.status).toBe(200);
        expect(resTurn3.body.customer_name).toBe('Suresh Bhai');
      });

      it('should handle business_insights query types (today_earnings, monthly_overview, suggestions)', async () => {
        const resEarnings = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('aaj kamai kem thai insights').toString('base64'),
          });

        expect(resEarnings.status).toBe(200);
        expect(resEarnings.body.isQuery).toBe(true);
        expect(resEarnings.body.queryType).toBe('business_insights');

        const resMonthly = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('mahina kem gayo insights').toString('base64'),
          });

        expect(resMonthly.status).toBe(200);
        expect(resMonthly.body.isQuery).toBe(true);

        const resSuggestions = await request(app)
          .post('/api/voice/query')
          .set('x-api-key', apiKey)
          .send({
            audioBase64: Buffer.from('kya sudharo karvo joie insights').toString('base64'),
          });

        expect(resSuggestions.status).toBe(200);
        expect(resSuggestions.body.isQuery).toBe(true);
        expect(resSuggestions.body.queryType).toBe('business_insights');
      });
    });
  });

  describe('Bill Generation API & UPI QR Code', () => {
    beforeEach(async () => {
      const skRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Ambika Provision',
          phone: '9876543210',
          upiId: '9876543210@paytm',
        });
      shopkeeperId = skRes.body.data.shopkeeperId;
      apiKey = skRes.body.data.apiKey;
    });

    it('POST /api/bill/generate should generate PDF base64, WhatsApp share link, and UPI QR code when upiId is present', async () => {
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
      expect(res.body.upiId).toBe('9876543210@paytm');
      expect(res.body.upiQrCodeBase64).toContain('data:image/png;base64,');
    });

    it('POST /api/bill/generate should skip UPI QR code generation if shopkeeper has no upiId', async () => {
      const skNoUpi = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'No UPI Shop',
          phone: '1231231234',
        });

      const res = await request(app)
        .post('/api/bill/generate')
        .set('x-api-key', skNoUpi.body.data.apiKey)
        .send({
          shopkeeperId: skNoUpi.body.data.shopkeeperId,
          customerName: 'Test Customer',
          totalAmount: 200,
        });

      expect(res.status).toBe(200);
      expect(res.body.upiQrCodeBase64).toBeNull();
    });

    it('PUT /api/shopkeepers/:id should update upiId and reflect in subsequent bill generation', async () => {
      const updateRes = await request(app)
        .put(`/api/shopkeepers/${shopkeeperId}`)
        .set('x-api-key', apiKey)
        .send({ upiId: 'updated@ybl' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.upiId).toBe('updated@ybl');

      const billRes = await request(app)
        .post('/api/bill/generate')
        .set('x-api-key', apiKey)
        .send({
          shopkeeperId,
          customerName: 'Patel Bhai',
          totalAmount: 100,
        });

      expect(billRes.status).toBe(200);
      expect(billRes.body.upiId).toBe('updated@ybl');
      expect(billRes.body.upiQrCodeBase64).toContain('data:image/png;base64,');
    });
  });

  describe('Shops & Multi-Shop Data Isolation API', () => {
    beforeEach(async () => {
      const skRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Main Store',
          phone: '9876543210',
        });
      shopkeeperId = skRes.body.data.shopkeeperId;
      apiKey = skRes.body.data.apiKey;
    });

    it('GET /api/shops should lazily auto-create default shop for existing shopkeepers', async () => {
      const res = await request(app)
        .get('/api/shops')
        .set('x-api-key', apiKey);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].shopName).toBe('Main Store');
      expect(res.body.data[0].isDefault).toBe(true);
    });

    it('POST /api/shops should create additional shops under the same shopkeeper', async () => {
      const createRes = await request(app)
        .post('/api/shops')
        .set('x-api-key', apiKey)
        .send({
          shopName: 'Branch 2 - Provisions',
          upiId: 'branch2@paytm',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.shopName).toBe('Branch 2 - Provisions');

      const listRes = await request(app)
        .get('/api/shops')
        .set('x-api-key', apiKey);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(2);
    });

    it('should isolate customers, transactions, and inventory between distinct shops', async () => {
      // 1. Create second shop
      const shop2Res = await request(app)
        .post('/api/shops')
        .set('x-api-key', apiKey)
        .send({ shopName: 'Shop 2' });

      const shop2Id = shop2Res.body.shopId;
      const shop1Id = `shop_${shopkeeperId}`;

      // 2. Add Customer 1 to Shop 1
      const c1Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop1Id)
        .send({ name: 'Shop 1 Customer', phone: '1111111111', totalUdhaar: 100 });

      // 3. Add Customer 2 to Shop 2
      const c2Res = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop2Id)
        .send({ name: 'Shop 2 Customer', phone: '2222222222', totalUdhaar: 200 });

      // 4. Verify GET /api/customers for Shop 1 returns only Customer 1
      const shop1Custs = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop1Id);

      expect(shop1Custs.status).toBe(200);
      expect(shop1Custs.body.data.length).toBe(1);
      expect(shop1Custs.body.data[0].name).toBe('Shop 1 Customer');

      // 5. Verify GET /api/customers for Shop 2 returns only Customer 2
      const shop2Custs = await request(app)
        .get(`/api/customers/${shopkeeperId}`)
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop2Id);

      expect(shop2Custs.status).toBe(200);
      expect(shop2Custs.body.data.length).toBe(1);
      expect(shop2Custs.body.data[0].name).toBe('Shop 2 Customer');

      // 6. Add Inventory to Shop 1 and Shop 2
      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop1Id)
        .send({ itemName: 'Item Shop 1', quantity: 10 });

      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop2Id)
        .send({ itemName: 'Item Shop 2', quantity: 20 });

      const shop1Inv = await request(app)
        .get(`/api/inventory/${shopkeeperId}`)
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop1Id);

      expect(shop1Inv.body.data.length).toBe(1);
      expect(shop1Inv.body.data[0].itemName).toBe('Item Shop 1');

      const shop2Inv = await request(app)
        .get(`/api/inventory/${shopkeeperId}`)
        .set('x-api-key', apiKey)
        .set('x-shop-id', shop2Id);

      expect(shop2Inv.body.data.length).toBe(1);
      expect(shop2Inv.body.data[0].itemName).toBe('Item Shop 2');
    });
  });

  describe('Data Export API', () => {
    beforeEach(async () => {
      const skRes = await request(app)
        .post('/api/shopkeepers')
        .send({
          shopName: 'Export Test Store',
          phone: '9876543210',
        });
      shopkeeperId = skRes.body.data.shopkeeperId;
      apiKey = skRes.body.data.apiKey;

      const custRes = await request(app)
        .post('/api/customers')
        .set('x-api-key', apiKey)
        .send({
          name: 'Export Customer 1',
          phone: '9988776655',
          totalUdhaar: 350,
        });

      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({
          customerId: custRes.body.data.customerId,
          type: 'udhaar_add',
          amount: 350,
          items: ['Rice', 'Sugar'],
        });
    });

    it('GET /api/export/:shopkeeperId?format=excel should return Excel spreadsheet buffer', async () => {
      const res = await request(app)
        .get(`/api/export/${shopkeeperId}?format=excel`)
        .set('x-api-key', apiKey)
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('data_export');
      expect(Buffer.isBuffer(res.body)).toBe(true);
    });

    it('GET /api/export/:shopkeeperId?format=pdf should return PDF document buffer', async () => {
      const res = await request(app)
        .get(`/api/export/${shopkeeperId}?format=pdf`)
        .set('x-api-key', apiKey)
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('data_export');
      expect(Buffer.isBuffer(res.body)).toBe(true);
    });

    it('GET /api/export/:shopkeeperId should enforce tenant isolation', async () => {
      const otherSk = await request(app)
        .post('/api/shopkeepers')
        .send({ shopName: 'Other Shop', phone: '0000000000' });

      const res = await request(app)
        .get(`/api/export/${otherSk.body.data.shopkeeperId}?format=excel`)
        .set('x-api-key', apiKey);

      expect(res.status).toBe(403);
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

    it('GET /api/summary/trends/:shopkeeperId should return weekly and monthly trends with 7 and 30 data points', async () => {
      const now = new Date().toISOString();

      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey)
        .send({ shopkeeperId, customerId, type: 'sale', amount: 500, timestamp: now });

      // Week trends
      const weekRes = await request(app)
        .get(`/api/summary/trends/${shopkeeperId}?period=week`)
        .set('x-api-key', apiKey);

      expect(weekRes.status).toBe(200);
      expect(weekRes.body.period).toBe('week');
      expect(Array.isArray(weekRes.body.dataPoints)).toBe(true);
      expect(weekRes.body.dataPoints.length).toBe(7);

      // Month trends
      const monthRes = await request(app)
        .get(`/api/summary/trends/${shopkeeperId}?period=month`)
        .set('x-api-key', apiKey);

      expect(monthRes.status).toBe(200);
      expect(monthRes.body.period).toBe('month');
      expect(Array.isArray(monthRes.body.dataPoints)).toBe(true);
      expect(monthRes.body.dataPoints.length).toBe(30);
    });
  });
});
