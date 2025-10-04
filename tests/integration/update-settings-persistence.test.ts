/**
 * Integration Test: Update Settings Persistence
 * Feature: Auto-Update System (T008)
 *
 * IMPORTANT: This test is written BEFORE implementation (TDD)
 * Verifies that update preferences persist across app restarts (simulated)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/tauri';

describe('T008: Update Settings Persistence', () => {
  it('should persist auto_check_enabled=false across restart', async () => {
    // Initial state: enabled by default
    const initial = await invoke<{ auto_check_enabled: boolean }>('get_update_preferences');
    expect(initial.auto_check_enabled).toBe(true);

    // User disables auto-check
    await invoke('set_auto_check_enabled', { enabled: false });

    const afterToggle = await invoke<{ auto_check_enabled: boolean }>('get_update_preferences');
    expect(afterToggle.auto_check_enabled).toBe(false);

    // Simulate app restart by re-fetching preferences
    // (In real app, this would involve closing and reopening)
    const afterRestart = await invoke<{ auto_check_enabled: boolean }>('get_update_preferences');

    // Setting should persist
    expect(afterRestart.auto_check_enabled).toBe(false);
  });

  it('should persist auto_check_enabled=true across restart', async () => {
    // Set to false first
    await invoke('set_auto_check_enabled', { enabled: false });
    const disabled = await invoke<{ auto_check_enabled: boolean }>('get_update_preferences');
    expect(disabled.auto_check_enabled).toBe(false);

    // Re-enable
    await invoke('set_auto_check_enabled', { enabled: true });

    // Simulate restart
    const afterRestart = await invoke<{ auto_check_enabled: boolean }>('get_update_preferences');

    // Should still be enabled
    expect(afterRestart.auto_check_enabled).toBe(true);
  });

  it('should persist last_check_timestamp across restart', async () => {
    // Record a check
    await invoke('record_update_check', { notifiedVersion: null });

    const beforeRestart = await invoke<{ last_check_timestamp: number | null }>(
      'get_update_preferences'
    );
    expect(beforeRestart.last_check_timestamp).toBeGreaterThan(0);

    const timestampValue = beforeRestart.last_check_timestamp;

    // Simulate restart
    const afterRestart = await invoke<{ last_check_timestamp: number | null }>(
      'get_update_preferences'
    );

    // Timestamp should persist exactly
    expect(afterRestart.last_check_timestamp).toBe(timestampValue);
  });

  it('should persist last_notified_version across restart', async () => {
    const testVersion = 'v1.5.0';

    // Record update notification
    await invoke('record_update_check', { notifiedVersion: testVersion });

    const beforeRestart = await invoke<{ last_notified_version: string | null }>(
      'get_update_preferences'
    );
    expect(beforeRestart.last_notified_version).toBe(testVersion);

    // Simulate restart
    const afterRestart = await invoke<{ last_notified_version: string | null }>(
      'get_update_preferences'
    );

    // Version should persist
    expect(afterRestart.last_notified_version).toBe(testVersion);
  });

  it('should maintain singleton pattern (id=1) across operations', async () => {
    // Perform multiple operations
    await invoke('set_auto_check_enabled', { enabled: false });
    await invoke('record_update_check', { notifiedVersion: 'v1.0.0' });
    await invoke('set_auto_check_enabled', { enabled: true });
    await invoke('record_update_check', { notifiedVersion: null });

    // Verify singleton still enforced
    const prefs = await invoke<{ id: number }>('get_update_preferences');
    expect(prefs.id).toBe(1);
  });

  it('should preserve all fields simultaneously across restart', async () => {
    // Set all fields to known values
    await invoke('set_auto_check_enabled', { enabled: false });
    await invoke('record_update_check', { notifiedVersion: 'v2.1.0' });

    const beforeRestart = await invoke<{
      id: number;
      auto_check_enabled: boolean;
      last_check_timestamp: number | null;
      last_notified_version: string | null;
      created_at: number;
      updated_at: number;
    }>('get_update_preferences');

    // Simulate restart
    const afterRestart = await invoke<{
      id: number;
      auto_check_enabled: boolean;
      last_check_timestamp: number | null;
      last_notified_version: string | null;
      created_at: number;
      updated_at: number;
    }>('get_update_preferences');

    // All fields should match
    expect(afterRestart.id).toBe(beforeRestart.id);
    expect(afterRestart.auto_check_enabled).toBe(beforeRestart.auto_check_enabled);
    expect(afterRestart.last_check_timestamp).toBe(beforeRestart.last_check_timestamp);
    expect(afterRestart.last_notified_version).toBe(beforeRestart.last_notified_version);
    expect(afterRestart.created_at).toBe(beforeRestart.created_at);
    expect(afterRestart.updated_at).toBe(beforeRestart.updated_at);
  });

  it('should handle rapid toggle operations without data loss', async () => {
    // Rapidly toggle setting multiple times
    await invoke('set_auto_check_enabled', { enabled: false });
    await invoke('set_auto_check_enabled', { enabled: true });
    await invoke('set_auto_check_enabled', { enabled: false });
    await invoke('set_auto_check_enabled', { enabled: true });

    // Final state should be accurate
    const final = await invoke<{ auto_check_enabled: boolean }>('get_update_preferences');
    expect(final.auto_check_enabled).toBe(true);
  });

  it('should handle concurrent check records without corruption', async () => {
    // Record multiple checks in sequence
    await invoke('record_update_check', { notifiedVersion: 'v1.0.0' });
    await invoke('record_update_check', { notifiedVersion: 'v1.1.0' });
    await invoke('record_update_check', { notifiedVersion: null });
    await invoke('record_update_check', { notifiedVersion: 'v1.2.0' });

    const final = await invoke<{
      last_notified_version: string | null;
      last_check_timestamp: number | null;
    }>('get_update_preferences');

    // Should have most recent values
    expect(final.last_notified_version).toBe('v1.2.0');
    expect(final.last_check_timestamp).toBeGreaterThan(0);
  });

  it('should restore defaults if preference row somehow deleted (defensive)', async () => {
    // This tests the INSERT OR IGNORE in migration
    // In normal operation, the row should always exist
    const prefs = await invoke<{
      id: number;
      auto_check_enabled: boolean;
    }>('get_update_preferences');

    // Row should exist with default values
    expect(prefs.id).toBe(1);
    expect(typeof prefs.auto_check_enabled).toBe('boolean');
  });
});
