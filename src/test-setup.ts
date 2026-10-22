/**
 * Vitest global setup — runs once before every test file.
 * Wires up jest-dom matchers and stubs Tauri / browser globals that React
 * Testing Library expects.
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Node 22+ ships its own global `localStorage`, which shadows jsdom's and is
// unusable without --localstorage-file. Fall back to an in-memory Storage.
if (typeof globalThis.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: memoryStorage });
}

// matchMedia stub — antd uses this in a few places (e.g., responsive utils).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ResizeObserver stub — antd Table and Calendar both use it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverStub;
