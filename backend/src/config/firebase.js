const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;

if (process.env.USE_MOCK_DB === 'true' || process.env.NODE_ENV === 'test') {
  // In-memory mock Firestore database for testing/mock mode
  const collections = {};

  const getCollection = (colName) => {
    if (!collections[colName]) {
      collections[colName] = new Map();
    }
    return collections[colName];
  };

  class MockQuery {
    constructor(colName, filters = []) {
      this.colName = colName;
      this.filters = filters;
    }

    where(field, op, value) {
      return new MockQuery(this.colName, [...this.filters, { field, op, value }]);
    }

    async get() {
      const col = getCollection(this.colName);
      const results = [];
      for (const [id, data] of col.entries()) {
        let match = true;
        for (const filter of this.filters) {
          if (filter.op === '==') {
            if (data[filter.field] !== filter.value) match = false;
          }
        }
        if (match) {
          results.push({
            id,
            exists: true,
            data: () => ({ ...data }),
          });
        }
      }
      return {
        empty: results.length === 0,
        docs: results,
        forEach: (cb) => results.forEach(cb),
      };
    }
  }

  class MockDocumentReference {
    constructor(colName, docId) {
      this.colName = colName;
      this.id = docId;
    }

    async get() {
      const col = getCollection(this.colName);
      if (col.has(this.id)) {
        return {
          id: this.id,
          exists: true,
          data: () => ({ ...col.get(this.id) }),
        };
      } else {
        return {
          id: this.id,
          exists: false,
          data: () => undefined,
        };
      }
    }

    async set(data, options = {}) {
      const col = getCollection(this.colName);
      if (options.merge && col.has(this.id)) {
        const existing = col.get(this.id);
        col.set(this.id, { ...existing, ...data });
      } else {
        col.set(this.id, { ...data });
      }
      return { id: this.id };
    }

    async update(data) {
      const col = getCollection(this.colName);
      if (!col.has(this.id)) {
        throw new Error(`Document ${this.id} does not exist`);
      }
      const existing = col.get(this.id);
      col.set(this.id, { ...existing, ...data });
      return { id: this.id };
    }
  }

  class MockCollectionReference extends MockQuery {
    doc(id) {
      const docId = id || 'doc_' + Math.random().toString(36).substring(2, 9);
      return new MockDocumentReference(this.colName, docId);
    }

    async add(data) {
      const id = 'doc_' + Math.random().toString(36).substring(2, 9);
      const docRef = new MockDocumentReference(this.colName, id);
      await docRef.set(data);
      return docRef;
    }
  }

  db = {
    collection: (colName) => new MockCollectionReference(colName),
    _reset: () => {
      Object.keys(collections).forEach((key) => delete collections[key]);
    },
  };
} else {
  // Initialize real Firebase Admin SDK
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      const serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (process.env.FIREBASE_PROJECT_ID) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    } else {
      admin.initializeApp();
    }
  }

  db = admin.firestore();
}

module.exports = { db, admin };
