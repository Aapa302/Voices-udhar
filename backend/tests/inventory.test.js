process.env.USE_MOCK_DB = 'true';
process.env.USE_MOCK_GEMINI = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/config/firebase');

describe('Inventory & Stock Tracking API', () => {
  const shopkeeperId1 = 'sk_test_shopkeeper_1';
  const apiKey1 = 'apiKey_test_shopkeeper_1';

  const shopkeeperId2 = 'sk_test_shopkeeper_2';
  const apiKey2 = 'apiKey_test_shopkeeper_2';

  let customerId1;

  beforeEach(async () => {
    if (db._reset) {
      db._reset();
    }

    // Seed shopkeeper 1
    await db.collection('shopkeepers').doc(shopkeeperId1).set({
      shopkeeperId: shopkeeperId1,
      shopkeeperName: 'Ramesh Patel',
      shopName: 'Ramesh General Store',
      apiKey: apiKey1,
    });

    // Seed shopkeeper 2
    await db.collection('shopkeepers').doc(shopkeeperId2).set({
      shopkeeperId: shopkeeperId2,
      shopkeeperName: 'Suresh Shah',
      shopName: 'Suresh Provision',
      apiKey: apiKey2,
    });

    // Seed customer for shopkeeper 1
    const custRef = await db.collection('customers').add({
      shopkeeperId: shopkeeperId1,
      name: 'Anil Bhai',
      phone: '9876543210',
      totalUdhaar: 100,
    });
    customerId1 = custRef.id;
  });

  describe('POST /api/inventory', () => {
    test('should return 401 if x-api-key is missing', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .send({ itemName: 'Parle-G', quantity: 10, unit: 'packet' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    test('should return 403 if provided shopkeeperId does not match authenticated shopkeeper', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ shopkeeperId: shopkeeperId2, itemName: 'Parle-G', quantity: 10 });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    test('should return 400 if itemName is missing', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ quantity: 10 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    test('should create a new inventory item if no match exists', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({
          itemName: 'Parle-G',
          quantity: 20,
          unit: 'packet',
          lowStockThreshold: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Inventory item created successfully');
      expect(res.body.data.itemName).toBe('Parle-G');
      expect(res.body.data.quantity).toBe(20);
      expect(res.body.data.unit).toBe('packet');
      expect(res.body.data.lowStockThreshold).toBe(5);
      expect(res.body.isLowStock).toBe(false);
    });

    test('should flag low stock when quantity <= lowStockThreshold', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({
          itemName: 'Sugar',
          quantity: 3,
          unit: 'kg',
          lowStockThreshold: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.quantity).toBe(3);
      expect(res.body.isLowStock).toBe(true);
    });

    test('should update existing item quantity when fuzzy matching item exists', async () => {
      // First create Parle-G
      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({
          itemName: 'Parle-G',
          quantity: 10,
          unit: 'packet',
          lowStockThreshold: 5,
        });

      // Add stock using slightly different casing/phonetics "parle g"
      const res = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({
          itemName: 'parle g',
          quantity: 15,
          mode: 'add',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Inventory item updated successfully');
      expect(res.body.data.quantity).toBe(25);
      expect(res.body.isLowStock).toBe(false);
    });
  });

  describe('GET /api/inventory/:shopkeeperId', () => {
    test('should return 403 if shopkeeperId parameter does not match authenticated shopkeeper', async () => {
      const res = await request(app)
        .get(`/api/inventory/${shopkeeperId2}`)
        .set('x-api-key', apiKey1);

      expect(res.status).toBe(403);
    });

    test('should list inventory items sorted with low-stock items first', async () => {
      // Seed normal stock item
      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Rice', quantity: 50, lowStockThreshold: 10 });

      // Seed low stock item
      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Tea', quantity: 2, lowStockThreshold: 5 });

      // Seed normal stock item
      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Biscuits', quantity: 30, lowStockThreshold: 5 });

      const res = await request(app)
        .get(`/api/inventory/${shopkeeperId1}`)
        .set('x-api-key', apiKey1);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(3);

      // Low stock item 'Tea' must be first
      expect(res.body.data[0].itemName).toBe('Tea');
      expect(res.body.data[0].isLowStock).toBe(true);
    });
  });

  describe('PUT /api/inventory/:itemId', () => {
    test('should update item quantity and threshold', async () => {
      const createRes = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Wheat', quantity: 20, lowStockThreshold: 5 });

      const itemId = createRes.body.data.itemId;

      const updateRes = await request(app)
        .put(`/api/inventory/${itemId}`)
        .set('x-api-key', apiKey1)
        .send({ quantity: 4, lowStockThreshold: 5 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.quantity).toBe(4);
      expect(updateRes.body.isLowStock).toBe(true);
    });

    test('should return 404 for non-existent itemId', async () => {
      const res = await request(app)
        .put('/api/inventory/non_existent_item')
        .set('x-api-key', apiKey1)
        .send({ quantity: 10 });

      expect(res.status).toBe(404);
    });

    test('should return 403 if item belongs to another shopkeeper', async () => {
      const createRes = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Oil', quantity: 20 });

      const itemId = createRes.body.data.itemId;

      const updateRes = await request(app)
        .put(`/api/inventory/${itemId}`)
        .set('x-api-key', apiKey2)
        .send({ quantity: 10 });

      expect(updateRes.status).toBe(403);
    });
  });

  describe('DELETE /api/inventory/:itemId', () => {
    test('should delete an item successfully', async () => {
      const createRes = await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Milk', quantity: 10 });

      const itemId = createRes.body.data.itemId;

      const delRes = await request(app)
        .delete(`/api/inventory/${itemId}`)
        .set('x-api-key', apiKey1);

      expect(delRes.status).toBe(200);
      expect(delRes.body.message).toBe('Inventory item deleted successfully');

      const getRes = await request(app)
        .get(`/api/inventory/${shopkeeperId1}`)
        .set('x-api-key', apiKey1);

      expect(getRes.body.data.find((it) => it.itemId === itemId)).toBeUndefined();
    });
  });

  describe('Voice Processing Inventory Intents', () => {
    test('should process add_stock intent audio and return stock fields', async () => {
      const base64Audio = Buffer.from('mock_add_stock').toString('base64');

      const res = await request(app)
        .post('/api/voice/process')
        .set('x-api-key', apiKey1)
        .send({ audioBase64: base64Audio });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('add_stock');
      expect(res.body.stock_item_name).toBe('Parle-G');
      expect(res.body.quantity).toBe(5);
      expect(res.body.unit).toBe('packet');
    });

    test('should process reduce_stock intent audio and return stock fields', async () => {
      const base64Audio = Buffer.from('mock_reduce_stock').toString('base64');

      const res = await request(app)
        .post('/api/voice/process')
        .set('x-api-key', apiKey1)
        .send({ audioBase64: base64Audio });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('reduce_stock');
      expect(res.body.stock_item_name).toBe('Parle-G');
      expect(res.body.quantity).toBe(2);
      expect(res.body.unit).toBe('packet');
    });
  });

  describe('Automatic Inventory Decrement on Sales', () => {
    test('should automatically decrement inventory on sale with matched items', async () => {
      // Seed inventory with 10 packets of Parle-G
      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Parle-G', quantity: 10, lowStockThreshold: 3 });

      // Log a sale transaction with 2 packets of Parle-G
      const txRes = await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey1)
        .send({
          customerId: customerId1,
          type: 'sale',
          amount: 20,
          items: [{ name: 'Parle-G', quantity: 2 }],
        });

      expect(txRes.status).toBe(201);

      // Verify inventory was reduced to 8
      const invRes = await request(app)
        .get(`/api/inventory/${shopkeeperId1}`)
        .set('x-api-key', apiKey1);

      const parleG = invRes.body.data.find((i) => i.itemName === 'Parle-G');
      expect(parleG).toBeDefined();
      expect(parleG.quantity).toBe(8);
      expect(parleG.isLowStock).toBe(false);
    });

    test('should trigger low stock flag when sale reduces quantity <= lowStockThreshold', async () => {
      // Seed inventory with 5 packets of Soap
      await request(app)
        .post('/api/inventory')
        .set('x-api-key', apiKey1)
        .send({ itemName: 'Soap', quantity: 5, lowStockThreshold: 3 });

      // Log sale reducing quantity by 3 (new quantity = 2 <= threshold 3)
      await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey1)
        .send({
          customerId: customerId1,
          type: 'sale',
          amount: 60,
          items: [{ name: 'Soap', quantity: 3 }],
        });

      const invRes = await request(app)
        .get(`/api/inventory/${shopkeeperId1}`)
        .set('x-api-key', apiKey1);

      const soap = invRes.body.data.find((i) => i.itemName === 'Soap');
      expect(soap).toBeDefined();
      expect(soap.quantity).toBe(2);
      expect(soap.isLowStock).toBe(true);
    });

    test('should not fail transaction log if item is not found in inventory', async () => {
      const txRes = await request(app)
        .post('/api/transactions')
        .set('x-api-key', apiKey1)
        .send({
          customerId: customerId1,
          type: 'sale',
          amount: 50,
          items: ['Unknown Special Item'],
        });

      expect(txRes.status).toBe(201);
    });
  });
});
