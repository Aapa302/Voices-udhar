const DB_NAME = 'voice_udhar_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pendingRecordings';

/**
 * Open IndexedDB connection
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      return reject(new Error('IndexedDB not supported in browser'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('shopId', 'shopId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Save a raw voice recording to IndexedDB offline queue.
 * @param {Object} item - { audioBase64, mimeType, timestamp, shopId, shopkeeperId, isQueryMode }
 * @returns {Promise<number>} Generated record ID
 */
export async function savePendingRecording(item) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const record = {
        ...item,
        createdAt: new Date().toISOString(),
      };

      const request = store.add(record);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('Error saving pending recording to IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  } catch (err) {
    console.warn('Fallback to localStorage for offline audio saving:', err.message);
    // Fallback to localStorage
    const saved = JSON.parse(localStorage.getItem('voice_udhar_pending_recordings') || '[]');
    const record = { ...item, id: Date.now(), createdAt: new Date().toISOString() };
    saved.push(record);
    localStorage.setItem('voice_udhar_pending_recordings', JSON.stringify(saved));
    return record.id;
  }
}

/**
 * Get count of pending offline recordings for current active shopId (or total count if no shopId specified).
 * @param {string} [shopId]
 * @returns {Promise<number>}
 */
export async function getPendingRecordingsCount(shopId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        const items = event.target.result || [];
        if (shopId) {
          const count = items.filter((it) => !it.shopId || it.shopId === shopId).length;
          resolve(count);
        } else {
          resolve(items.length);
        }
      };

      request.onerror = () => {
        resolve(0);
      };
    });
  } catch (err) {
    const saved = JSON.parse(localStorage.getItem('voice_udhar_pending_recordings') || '[]');
    if (shopId) {
      return saved.filter((it) => !it.shopId || it.shopId === shopId).length;
    }
    return saved.length;
  }
}

/**
 * Get all pending offline recordings.
 * @returns {Promise<Array>}
 */
export async function getAllPendingRecordings() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result || []);
      };

      request.onerror = () => {
        resolve([]);
      };
    });
  } catch (err) {
    return JSON.parse(localStorage.getItem('voice_udhar_pending_recordings') || '[]');
  }
}
