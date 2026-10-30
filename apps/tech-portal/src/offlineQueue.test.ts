import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initDB, enqueueRequest, syncQueue } from './offlineQueue';

// In-memory store for IndexedDB mock
interface QueueItem {
  id: number;
  url: string;
  method: string;
  body: any;
  timestamp: number;
}

const itemsMap = new Map<number, QueueItem>();
let nextId = 1;

let lastUpgradeFn: ((db: any) => void) | null = null;

vi.mock('idb', () => ({
  openDB: vi.fn().mockImplementation(async (dbName: string, version: number, options?: any) => {
    if (options?.upgrade) {
      lastUpgradeFn = options.upgrade;
    }
    return {
      add: async (storeName: string, item: Omit<QueueItem, 'id'>) => {
        const id = nextId++;
        const record = { ...item, id };
        itemsMap.set(id, record);
        return id;
      },
      transaction: (_storeName: string, _mode: string) => ({
        objectStore: (_name: string) => ({
          getAll: async () => Array.from(itemsMap.values()),
          delete: async (id: number) => {
            itemsMap.delete(id);
          },
        }),
      }),
    };
  }),
}));

describe('offlineQueue', () => {
  beforeEach(() => {
    itemsMap.clear();
    nextId = 1;
    lastUpgradeFn = null;
    vi.restoreAllMocks();

    // Default navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    // Mock globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    }));

    // Suppress console.error during tests unless needed
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('initDB', () => {
    it('initializes the database and executes upgrade callback when store is missing', async () => {
      const db = await initDB();
      expect(db).toBeDefined();

      expect(lastUpgradeFn).toBeDefined();
      if (lastUpgradeFn) {
        const createdStores: string[] = [];
        const mockDb = {
          objectStoreNames: {
            contains: (name: string) => false,
          },
          createObjectStore: vi.fn().mockImplementation((name: string, options: any) => {
            createdStores.push(name);
            expect(options).toEqual({ keyPath: 'id', autoIncrement: true });
          }),
        };

        lastUpgradeFn(mockDb);
        expect(mockDb.createObjectStore).toHaveBeenCalledWith('offline-queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    });

    it('skips creating object store during upgrade if it already exists', async () => {
      await initDB();
      if (lastUpgradeFn) {
        const mockDb = {
          objectStoreNames: {
            contains: (name: string) => name === 'offline-queue',
          },
          createObjectStore: vi.fn(),
        };

        lastUpgradeFn(mockDb);
        expect(mockDb.createObjectStore).not.toHaveBeenCalled();
      }
    });
  });

  describe('enqueueRequest', () => {
    it('enqueues a request into the offline store with URL, method, body, and timestamp', async () => {
      const url = '/api/v1/chemicals/log';
      const method = 'POST';
      const body = { chemical_id: 'chem-123', amount: 5, unit: 'oz' };

      const beforeTime = Date.now();
      await enqueueRequest(url, method, body);
      const afterTime = Date.now();

      expect(itemsMap.size).toBe(1);
      const saved = itemsMap.get(1);
      expect(saved).toBeDefined();
      expect(saved?.url).toBe(url);
      expect(saved?.method).toBe(method);
      expect(saved?.body).toEqual(body);
      expect(saved?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(saved?.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('syncQueue', () => {
    it('does nothing when navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      await enqueueRequest('/api/v1/test', 'POST', { test: 1 });
      expect(itemsMap.size).toBe(1);

      await syncQueue();

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(itemsMap.size).toBe(1);
    });

    it('syncs queued requests and deletes them from store when online', async () => {
      await enqueueRequest('/api/v1/chemical-log', 'POST', { item: 'A' });
      await enqueueRequest('/api/v1/chemical-log', 'POST', { item: 'B' });

      expect(itemsMap.size).toBe(2);

      await syncQueue();

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/v1/chemical-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'A' }),
      });
      expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/v1/chemical-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'B' }),
      });

      expect(itemsMap.size).toBe(0);
    });

    it('handles empty queue without error when online', async () => {
      expect(itemsMap.size).toBe(0);
      await syncQueue();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('retains item in queue when fetch fails with network error', async () => {
      await enqueueRequest('/api/v1/fail-endpoint', 'POST', { data: 'err' });

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await syncQueue();

      expect(console.error).toHaveBeenCalledWith('Failed to sync item');
      expect(itemsMap.size).toBe(1);
      expect(itemsMap.get(1)?.url).toBe('/api/v1/fail-endpoint');
    });

    it('continues processing subsequent queue items if one item fails', async () => {
      await enqueueRequest('/api/v1/item1', 'POST', { id: 1 });
      await enqueueRequest('/api/v1/item2', 'POST', { id: 2 });

      // First call fails, second call succeeds
      vi.mocked(globalThis.fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as any);

      await syncQueue();

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalledWith('Failed to sync item');
      // Item 1 retained, Item 2 deleted
      expect(itemsMap.size).toBe(1);
      expect(itemsMap.has(1)).toBe(true);
      expect(itemsMap.has(2)).toBe(false);
    });
  });

  describe('window online event listener', () => {
    it('triggers syncQueue when window dispatches "online" event', async () => {
      await enqueueRequest('/api/v1/auto-sync', 'POST', { trigger: 'event' });
      expect(itemsMap.size).toBe(1);

      window.dispatchEvent(new Event('online'));

      // Wait brief microtask for async event handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'event' }),
      });
      expect(itemsMap.size).toBe(0);
    });
  });
});
