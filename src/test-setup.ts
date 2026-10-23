/**
 * Vitest global setup — runs once before every test file.
 * Wires up jest-dom matchers and stubs Tauri / browser globals that React
 * Testing Library expects.
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';

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

// React Router's data routers build a fetch `Request` with an AbortSignal for
// every navigation. Node's `Request` rejects jsdom's AbortSignal, so drop it;
// the Request then carries a signal of its own.
{
  const NodeRequest = globalThis.Request;
  globalThis.Request = class extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init ? { ...init, signal: undefined } : init);
    }
  } as typeof Request;
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
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// antd injects ~2000 CSS-in-JS rules into <head>, and jsdom re-matches every
// rule on each getComputedStyle call (20-65 ms per call). ByRole queries and
// user-event's pointer-events check make dozens of those calls per test, so
// antd tests spent 75-95% of their time there and timed out under CPU load.
// Every render gets a StyleProvider that writes antd's styles into a detached
// node instead; no test relies on antd CSS for visibility.
vi.mock('@testing-library/react', async (importOriginal) => {
  const rtl = await importOriginal<typeof import('@testing-library/react')>();
  const { createElement } = await import('react');
  const { StyleProvider } = await import('@ant-design/cssinjs');
  const antdStyleSink = document.createElement('div');

  const render = ((ui, options) => {
    const Outer = options?.wrapper;
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StyleProvider, { container: antdStyleSink }, Outer ? createElement(Outer, null, children) : children);
    return rtl.render(ui, { ...options, wrapper });
  }) as typeof rtl.render;

  return { ...rtl, render };
});

// RTL registers its auto-cleanup only when the module is first loaded, so in a
// shared worker (--poolOptions.threads.singleThread) later files kept the
// previous test's DOM and listeners mounted.
afterEach(async () => {
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
