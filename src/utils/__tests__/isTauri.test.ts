import { describe, it, expect, afterEach } from 'vitest';
import { isTauri } from '../isTauri';

type TauriWindow = Window & { __TAURI_IPC__?: unknown; __TAURI__?: unknown };

afterEach(() => {
  delete (window as TauriWindow).__TAURI_IPC__;
  delete (window as TauriWindow).__TAURI__;
});

describe('isTauri', () => {
  it('detects Tauri from the IPC bridge, without the global __TAURI__ object', () => {
    (window as TauriWindow).__TAURI_IPC__ = () => {};
    expect((window as TauriWindow).__TAURI__).toBeUndefined();
    expect(isTauri()).toBe(true);
  });

  it('is false in a plain browser', () => {
    expect(isTauri()).toBe(false);
  });
});
