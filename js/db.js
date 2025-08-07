// js/db.js

const DB_NAME = "workshop-db"; // Changed name for clarity
const DB_VERSION = 2; // Incremented version to trigger onupgradeneeded
const STORES = {
  IMAGES: "images",
  SYNC_QUEUE: "sync-queue",
};

let db;

/**
 * Opens and initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = event => {
      console.error("Database error:", event.target.error);
      reject("Error opening database.");
    };

    request.onupgradeneeded = event => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(STORES.IMAGES)) {
        dbInstance.createObjectStore(STORES.IMAGES);
      }
      if (!dbInstance.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        // Create store for sync queue, with auto-incrementing key
        dbInstance.createObjectStore(STORES.SYNC_QUEUE, {
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = event => {
      db = event.target.result;
      resolve(db);
    };
  });
}

/**
 * Retrieves an image blob from the database.
 * @param {string} path The path of the image to retrieve (used as the key).
 * @returns {Promise<Blob|null>} A promise that resolves with the image blob or null if not found.
 */
export async function getImage(path) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(STORES.IMAGES, "readonly");
    const store = transaction.objectStore(STORES.IMAGES);
    const request = store.get(path);

    request.onerror = () => {
      reject("Error fetching image from DB.");
    };

    request.onsuccess = () => {
      resolve(request.result || null);
    };
  });
}

/**
 * Stores an image blob in the database.
 * @param {string} path The path of the image to store (used as the key).
 * @param {Blob} blob The image blob data to store.
 * @returns {Promise<void>} A promise that resolves when the image is successfully stored.
 */
export async function storeImage(path, blob) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(STORES.IMAGES, "readwrite");
    const store = transaction.objectStore(STORES.IMAGES);
    const request = store.put(blob, path);

    request.onerror = () => {
      reject("Error storing image in DB.");
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Adds an operation to the synchronization queue.
 * @param {object} operation The operation to queue (e.g., { type: 'SAVE_INVENTORY', payload: {...} }).
 * @returns {Promise<void>}
 */
export async function addToSyncQueue(operation) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(STORES.SYNC_QUEUE, "readwrite");
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.add(operation);
    request.onerror = () => reject("Failed to add to sync queue.");
    request.onsuccess = () => resolve();
  });
}

/**
 * Retrieves all operations from the synchronization queue.
 * @returns {Promise<Array<object>>}
 */
export async function getSyncQueue() {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(STORES.SYNC_QUEUE, "readonly");
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.getAll();
    request.onerror = () => reject("Failed to get sync queue.");
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Clears the entire synchronization queue.
 * @returns {Promise<void>}
 */
export async function clearSyncQueue() {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(STORES.SYNC_QUEUE, "readwrite");
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.clear();
    request.onerror = () => reject("Failed to clear sync queue.");
    request.onsuccess = () => resolve();
  });
}
