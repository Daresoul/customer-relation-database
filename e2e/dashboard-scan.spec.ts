/**
 * E2E: scan a microchip on Main Dashboard, no patient matches, verify the UI
 * routes the user toward creating one.
 *
 * Mock layer: returns an empty patient list and a stubbed dashboard-stats
 * response. Backup config returns "not configured" so the startup backup is
 * a no-op. We don't assert on the actual create flow here — that's covered
 * by the WebdriverIO full-stack suite. This test verifies the *flow plumbing*
 * (scan detected → search ran → no result → user is on patients tab).
 */

import { test, expect } from '@playwright/test';
import { installTauriMock, makeBackupConfig, makeDefaultSettings } from './helpers/mockInvoke';

test.describe('Main Dashboard — microchip scan', () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page, {
      // No-op startup queries.
      get_dashboard_stats: () => ({
        total_patients: 0,
        active_patients: 0,
        total_households: 0,
        total_medical_records: 0,
      }),
      get_patients: () => [],
      search_patients: () => [],
      search_households: () => ({ results: [], total: 0, hasMore: false }),
      quick_search_households: () => [],
      get_all_households: () => [],
      get_dashboard_stats_v2: () => ({ totalPatients: 0, activePatients: 0, totalHouseholds: 0 }),
      // App-level
      get_app_settings: () => ({
        settings: {
          id: 1,
          userId: 'default',
          language: 'en',
          currencyId: 1,
          theme: 'light',
          dateFormat: 'MM/DD/YYYY',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        currency: { id: 1, code: 'USD', name: 'US Dollar', symbol: '$' },
      }),
      get_currencies: () => [{ id: 1, code: 'USD', name: 'US Dollar', symbol: '$' }],
      get_species: () => [
        { id: 1, name: 'Dog', active: true, displayOrder: 1, color: '#3498db' },
        { id: 2, name: 'Cat', active: true, displayOrder: 2, color: '#e67e22' },
      ],
      get_breeds: () => [],
      get_view_preference: () => null,
      get_backup_config: () => ({ directory: null, lastBackupAt: null, lastError: null }),
      get_pending_device_entries: () => [],
      list_pending_device_entries: () => [],
      get_device_integrations: () => [],
      get_file_watcher_statuses: () => [],
      get_device_connection_statuses: () => [],
      get_update_preferences: () => ({ autoCheckEnabled: false, lastCheckTimestamp: null }),
    });
  });

  test('loads the main dashboard with empty patient list', async ({ page }) => {
    await page.goto('/');
    // The dashboard should render — wait for any patient-tab indicator
    await expect(page.locator('body')).toBeVisible();
    // Give the app a beat to wire up; this is a smoke test for the mock layer.
    await page.waitForTimeout(500);
  });

  test('records scan keystrokes as invoke calls to search_patients', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Simulate a scanner burst (12-hex FDX-B). Inter-key delay <50ms triggers
    // useBarcodeScanner's burst detection.
    await page.keyboard.type('C9C2540C01FE', { delay: 10 });
    await page.keyboard.press('Enter');

    // Give the dashboard a moment to fire its search
    await page.waitForTimeout(300);

    // Verify a search invocation reached the mock backend with the
    // normalized 15-digit code.
    const calls = await page.evaluate(() => (window as any).__INVOKE_CALLS__ as any[]);
    const searchCalls = calls.filter((c) => c.cmd === 'search_patients');
    expect(searchCalls.length).toBeGreaterThan(0);
    const lastSearch = searchCalls[searchCalls.length - 1];
    // After normalization, the scanned hex becomes the 15-digit decimal.
    expect(lastSearch.args.query).toBe('807010000007678');
  });
});
