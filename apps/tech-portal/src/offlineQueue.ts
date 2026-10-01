import { openDB } from 'idb';

const DB_NAME = 'tech-portal-db';
const STORE_NAME = 'offline-queue';

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

export const enqueueRequest = async (url: string, method: string, body: any) => {
  const db = await initDB();
  await db.add(STORE_NAME, { url, method, body, timestamp: Date.now() });
};

export const syncQueue = async () => {
  if (!navigator.onLine) return;
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const items = await store.getAll();

  for (const item of items) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
      await store.delete(item.id);
    } catch (e) {
      console.error('Failed to sync item');
    }
  }
};

window.addEventListener('online', syncQueue);
