/**
 * Vitest global setup — runs once before every test file.
 * Wires up jest-dom matchers and stubs Tauri / browser globals that React
 * Testing Library expects.
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
