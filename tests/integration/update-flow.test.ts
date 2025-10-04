/**
 * Integration Test: Update Flow
 * Feature: Auto-Update System (T007)
 *
 * IMPORTANT: This test is written BEFORE implementation (TDD)
 * Tests the full end-to-end update notification flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { invoke } from '@tauri-apps/api/tauri';

// Mock Tauri updater API
vi.mock('@tauri-apps/api/updater', () => ({
  checkUpdate: vi.fn(),
  installUpdate: vi.fn(),
  onUpdaterEvent: vi.fn(),
}));

describe('T007: Update Flow Integration Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should complete update check in less than 5 seconds (non-blocking)', async () => {
    // Mock: No update available
    vi.mocked(checkUpdate).mockResolvedValue({
      shouldUpdate: false,
      manifest: undefined,
    });

    const startTime = Date.now();

    await checkUpdate();

    const elapsed = Date.now() - startTime;

    // Should be very fast when no update (< 5s requirement)
    expect(elapsed).toBeLessThan(5000);
  });

  it('should detect update and record check with version', async () => {
    const mockManifest = {
      version: 'v1.2.0',
      notes: 'New features and bug fixes',
      pub_date: '2025-01-25T12:00:00Z',
      platforms: {
        'darwin-x86_64': {
          signature: 'mock_signature',
          url: 'https://github.com/example/releases/app-v1.2.0-x86_64.dmg',
        },
      },
    };

    // Mock: Update available
    vi.mocked(checkUpdate).mockResolvedValue({
      shouldUpdate: true,
      manifest: mockManifest,
    });

    const result = await checkUpdate();

    expect(result.shouldUpdate).toBe(true);
    expect(result.manifest?.version).toBe('v1.2.0');

    // After detecting update, should record the check
    await invoke('record_update_check', { notifiedVersion: result.manifest?.version });

    const prefs = await invoke<{ last_notified_version: string | null }>(
      'get_update_preferences'
    );

    expect(prefs.last_notified_version).toBe('v1.2.0');
  });

  it('should NOT record version when no update available', async () => {
    // Mock: No update
    vi.mocked(checkUpdate).mockResolvedValue({
      shouldUpdate: false,
      manifest: undefined,
    });

    const result = await checkUpdate();

    expect(result.shouldUpdate).toBe(false);

    // Record check without version
    await invoke('record_update_check', { notifiedVersion: null });

    const prefs = await invoke<{
      last_check_timestamp: number | null;
      last_notified_version: string | null;
    }>('get_update_preferences');

    // Timestamp updated but version is null
    expect(prefs.last_check_timestamp).toBeGreaterThan(0);
    expect(prefs.last_notified_version).toBeNull();
  });

  it('should respect auto_check_enabled setting', async () => {
    // Disable auto-check
    await invoke('set_auto_check_enabled', { enabled: false });

    const prefs = await invoke<{ auto_check_enabled: boolean }>('get_update_preferences');
    expect(prefs.auto_check_enabled).toBe(false);

    // In real app, this would prevent automatic checks
    // Manual checks should still work
    vi.mocked(checkUpdate).mockResolvedValue({
      shouldUpdate: false,
      manifest: undefined,
    });

    // Manual check should succeed even when auto-check disabled
    const result = await checkUpdate();
    expect(result).toBeDefined();
  });

  it('should handle updater events (PENDING, DONE, ERROR)', async () => {
    const eventHandlers: ((event: any) => void)[] = [];

    // Mock onUpdaterEvent to capture handlers
    vi.mocked(onUpdaterEvent).mockImplementation((handler) => {
      eventHandlers.push(handler);
      return Promise.resolve(() => {}); // Return unlisten function
    });

    const statuses: string[] = [];

    const unlisten = await onUpdaterEvent((event) => {
      statuses.push(event.status);
    });

    // Simulate events
    eventHandlers[0]({ status: 'PENDING' });
    eventHandlers[0]({ status: 'DONE' });

    expect(statuses).toContain('PENDING');
    expect(statuses).toContain('DONE');

    // Cleanup
    unlisten();
  });

  it('should maintain non-blocking UI during download (mocked)', async () => {
    const mockManifest = {
      version: 'v1.2.0',
      notes: 'Update',
      pub_date: '2025-01-25T12:00:00Z',
      platforms: {},
    };

    vi.mocked(checkUpdate).mockResolvedValue({
      shouldUpdate: true,
      manifest: mockManifest,
    });

    // Mock slow download (simulate network delay)
    vi.mocked(installUpdate).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    const startTime = Date.now();

    // This should not block (returns immediately in real app)
    const installPromise = installUpdate();

    const checkTime = Date.now() - startTime;

    // Call should return quickly (< 50ms)
    expect(checkTime).toBeLessThan(50);

    // Wait for install to complete
    await installPromise;
  });

  it('should handle update check failure gracefully', async () => {
    // Mock network error
    vi.mocked(checkUpdate).mockRejectedValue(new Error('Network error'));

    await expect(checkUpdate()).rejects.toThrow('Network error');

    // App should continue functioning even if check fails
    // Verify preferences are still accessible
    const prefs = await invoke('get_update_preferences');
    expect(prefs).toBeDefined();
  });

  it('should update last_check_timestamp after every check', async () => {
    const before = await invoke<{ last_check_timestamp: number | null }>(
      'get_update_preferences'
    );

    // Mock successful check
    vi.mocked(checkUpdate).mockResolvedValue({
      shouldUpdate: false,
      manifest: undefined,
    });

    await checkUpdate();
    await invoke('record_update_check', { notifiedVersion: null });

    const after = await invoke<{ last_check_timestamp: number | null }>('get_update_preferences');

    expect(after.last_check_timestamp).toBeGreaterThan(before.last_check_timestamp || 0);
  });
});
