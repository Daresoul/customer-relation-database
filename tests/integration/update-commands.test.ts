/**
 * Contract Tests: Update Commands
 * Feature: Auto-Update System
 *
 * IMPORTANT: These tests are written BEFORE implementation (TDD)
 * They MUST FAIL until the Tauri commands are registered in main.rs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/tauri';

describe('Update Commands - Contract Tests', () => {
  describe('T004: get_update_preferences', () => {
    it('should return update preferences with all required fields', async () => {
      const prefs = await invoke<{
        id: number;
        auto_check_enabled: boolean;
        last_check_timestamp: number | null;
        last_notified_version: string | null;
        created_at: number;
        updated_at: number;
      }>('get_update_preferences');

      // Assert singleton pattern
      expect(prefs.id).toBe(1);

      // Assert required fields
      expect(typeof prefs.auto_check_enabled).toBe('boolean');
      expect(typeof prefs.created_at).toBe('number');
      expect(typeof prefs.updated_at).toBe('number');

      // Assert optional fields (nullable)
      expect(
        prefs.last_check_timestamp === null || typeof prefs.last_check_timestamp === 'number'
      ).toBe(true);
      expect(
        prefs.last_notified_version === null || typeof prefs.last_notified_version === 'string'
      ).toBe(true);

      // Assert default values
      expect(prefs.auto_check_enabled).toBe(true); // Default from migration
      expect(prefs.created_at).toBeGreaterThan(0);
      expect(prefs.updated_at).toBeGreaterThan(0);
    });

    it('should return the same singleton row on multiple calls', async () => {
      const prefs1 = await invoke('get_update_preferences');
      const prefs2 = await invoke('get_update_preferences');

      expect(prefs1).toEqual(prefs2);
    });
  });

  describe('T005: set_auto_check_enabled', () => {
    it('should toggle auto_check_enabled from true to false', async () => {
      // Get initial state (should be true from migration default)
      const initial = await invoke<{ auto_check_enabled: boolean; updated_at: number }>(
        'get_update_preferences'
      );
      expect(initial.auto_check_enabled).toBe(true);

      // Toggle to false
      await invoke('set_auto_check_enabled', { enabled: false });

      const afterDisable = await invoke<{ auto_check_enabled: boolean; updated_at: number }>(
        'get_update_preferences'
      );
      expect(afterDisable.auto_check_enabled).toBe(false);
      expect(afterDisable.updated_at).toBeGreaterThan(initial.updated_at);
    });

    it('should toggle auto_check_enabled from false to true', async () => {
      // First set to false
      await invoke('set_auto_check_enabled', { enabled: false });
      const afterDisable = await invoke<{ auto_check_enabled: boolean; updated_at: number }>(
        'get_update_preferences'
      );
      expect(afterDisable.auto_check_enabled).toBe(false);

      // Toggle back to true
      await invoke('set_auto_check_enabled', { enabled: true });

      const afterEnable = await invoke<{ auto_check_enabled: boolean; updated_at: number }>(
        'get_update_preferences'
      );
      expect(afterEnable.auto_check_enabled).toBe(true);
      expect(afterEnable.updated_at).toBeGreaterThan(afterDisable.updated_at);
    });

    it('should update the updated_at timestamp', async () => {
      const before = await invoke<{ updated_at: number }>('get_update_preferences');

      // Wait 10ms to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await invoke('set_auto_check_enabled', { enabled: false });

      const after = await invoke<{ updated_at: number }>('get_update_preferences');
      expect(after.updated_at).toBeGreaterThan(before.updated_at);
    });
  });

  describe('T006: record_update_check', () => {
    it('should update last_check_timestamp without notified_version', async () => {
      const before = await invoke<{
        last_check_timestamp: number | null;
        last_notified_version: string | null;
        updated_at: number;
      }>('get_update_preferences');

      await invoke('record_update_check', { notifiedVersion: null });

      const after = await invoke<{
        last_check_timestamp: number | null;
        last_notified_version: string | null;
        updated_at: number;
      }>('get_update_preferences');

      // Timestamp should be updated to current time
      expect(after.last_check_timestamp).toBeGreaterThan(before.last_check_timestamp || 0);

      // Version should remain null (no update available)
      expect(after.last_notified_version).toBeNull();

      // updated_at should increment
      expect(after.updated_at).toBeGreaterThan(before.updated_at);
    });

    it('should update last_check_timestamp WITH notified_version', async () => {
      const testVersion = 'v1.2.3';

      await invoke('record_update_check', { notifiedVersion: testVersion });

      const after = await invoke<{
        last_check_timestamp: number | null;
        last_notified_version: string | null;
      }>('get_update_preferences');

      // Timestamp should be set
      expect(after.last_check_timestamp).toBeGreaterThan(0);

      // Version should match
      expect(after.last_notified_version).toBe(testVersion);
    });

    it('should increment timestamp on repeated calls', async () => {
      await invoke('record_update_check', { notifiedVersion: null });
      const first = await invoke<{ last_check_timestamp: number | null }>(
        'get_update_preferences'
      );

      // Wait 10ms to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await invoke('record_update_check', { notifiedVersion: null });
      const second = await invoke<{ last_check_timestamp: number | null }>(
        'get_update_preferences'
      );

      expect(second.last_check_timestamp).toBeGreaterThan(first.last_check_timestamp!);
    });

    it('should overwrite previous notified_version', async () => {
      await invoke('record_update_check', { notifiedVersion: 'v1.0.0' });
      const first = await invoke<{ last_notified_version: string | null }>(
        'get_update_preferences'
      );
      expect(first.last_notified_version).toBe('v1.0.0');

      await invoke('record_update_check', { notifiedVersion: 'v2.0.0' });
      const second = await invoke<{ last_notified_version: string | null }>(
        'get_update_preferences'
      );
      expect(second.last_notified_version).toBe('v2.0.0');
    });

    it('should clear notified_version when passed null', async () => {
      // First set a version
      await invoke('record_update_check', { notifiedVersion: 'v1.0.0' });
      const withVersion = await invoke<{ last_notified_version: string | null }>(
        'get_update_preferences'
      );
      expect(withVersion.last_notified_version).toBe('v1.0.0');

      // Clear it by passing null
      await invoke('record_update_check', { notifiedVersion: null });
      const cleared = await invoke<{ last_notified_version: string | null }>(
        'get_update_preferences'
      );
      expect(cleared.last_notified_version).toBeNull();
    });
  });
});
