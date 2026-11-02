import '@testing-library/jest-dom';
import { vi } from 'vitest';
import zlib from 'node:zlib';

// Compatibility shim for Node.js < 22 environments (e.g. CI runner on Node 20)
// where zlib lacks createZstdDecompress, preventing undici/jsdom decompress.js crash
if (!(zlib as any).createZstdDecompress) {
  (zlib as any).createZstdDecompress = function () {};
  (zlib as any).constants = (zlib as any).constants || {};
  if ((zlib as any).constants.ZSTD_d_windowLogMax === undefined) {
    (zlib as any).constants.ZSTD_d_windowLogMax = 23;
  }
}

// In-memory Storage mock for localStorage and sessionStorage
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length;
    },
  };
};

Object.defineProperty(window, 'localStorage', { value: createStorageMock() });
Object.defineProperty(window, 'sessionStorage', { value: createStorageMock() });
