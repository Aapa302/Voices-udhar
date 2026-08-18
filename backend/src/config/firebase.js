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

  /**
   * MockQuery supports basic filtering operators: '==', '>', '<', '>=', '<='.
   * WARNING: This mock implementation is intended for unit/integration tests and mock mode.
   * Complex Firestore queries (e.g. array-contains, in, or compound indexes) are not supported in this mock.
   */
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
          const val = data[filter.field];
          if (filter.op === '==') {
            if (val !== filter.value) match = false;
          } else if (filter.op === '>') {
            if (!(val > filter.value)) match = false;
          } else if (filter.op === '<') {
            if (!(val < filter.value)) match = false;
          } else if (filter.op === '>=') {
            if (!(val >= filter.value)) match = false;
          } else if (filter.op === '<=') {
            if (!(val <= filter.value)) match = false;
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
    let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (serviceAccountPath) {
      serviceAccountPath = path.resolve(serviceAccountPath);
    }

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
      const serviceAccount = JSON.parse(fileContent);

      const projectId = serviceAccount.project_id || serviceAccount.projectId;
      const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
      const privateKey = serviceAccount.private_key || serviceAccount.privateKey;

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey ? privateKey.replace(/\\n/g, '\n') : undefined,
        }),
        projectId,
      });

      console.log(`[Firebase] Initialized using service account file at "${serviceAccountPath}" for project "${projectId}".`);
    } else if (process.env.FIREBASE_PROJECT_ID) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });

      console.log(`[Firebase] Initialized using individual environment variables for project "${projectId}".`);
    } else {
      admin.initializeApp();
      console.log('[Firebase] Initialized using default credentials.');
    }
  }

  db = admin.firestore();
}

module.exports = { db, admin };
