// js/db.js

const DB_NAME = "workshop-images-db";
const STORE_NAME = "images";
const DB_VERSION = 1;

let db;

/**
 * Opens and initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
function openImageDB() {
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
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME);
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
  const dbInstance = await openImageDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
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
  const dbInstance = await openImageDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(blob, path);

    request.onerror = () => {
      reject("Error storing image in DB.");
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}
