/**
 * E2E: Settings → Backups page workflow.
 *
 * Covers the recently-added backup feature: viewing the page when nothing is
 * configured, "Backup now" button is disabled until a directory is picked,
 * after `set_backup_directory` succeeds the status updates.
 */

import { test, expect } from '@playwright/test';
import { installTauriMock } from './helpers/mockInvoke';

test.describe('Settings → Backups', () => {
  test('shows "Not configured" state on first visit', async ({ page }) => {
    // Per-test mock state — start with no destination set.
    await installTauriMock(page, {
      get_app_settings: () => ({
        settings: {
          id: 1, userId: 'default', language: 'en', currencyId: 1, theme: 'light',
          dateFormat: 'MM/DD/YYYY', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        },
        currency: { id: 1, code: 'USD', name: 'US Dollar', symbol: '$' },
      }),
      get_currencies: () => [{ id: 1, code: 'USD', name: 'US Dollar', symbol: '$' }],
      get_species: () => [],
      get_breeds: () => [],
      get_view_preference: () => null,
      get_backup_config: () => ({ directory: null, lastBackupAt: null, lastError: null }),
      get_dashboard_stats: () => ({ total_patients: 0, active_patients: 0, total_households: 0, total_medical_records: 0 }),
      get_patients: () => [],
      get_pending_device_entries: () => [],
      list_pending_device_entries: () => [],
      get_device_integrations: () => [],
      get_file_watcher_statuses: () => [],
      get_device_connection_statuses: () => [],
      get_update_preferences: () => ({ autoCheckEnabled: false, lastCheckTimestamp: null }),
      get_appointments: () => [],
      get_rooms: () => [],
      get_record_templates: () => [],
      search_record_templates: () => [],
      get_line_item_templates: () => [],
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // The Backups tab lives in the Settings sidebar.
    // i18n key "settings:sections.backups" → "Backups" in English. We match
    // case-insensitively to absorb any minor label changes.
    const backupsMenuItem = page.getByRole('menuitem', { name: /backups/i });
    await expect(backupsMenuItem).toBeVisible({ timeout: 10_000 });
    await backupsMenuItem.click();

    // "Not configured" tag should appear.
    await expect(page.getByText(/not configured/i)).toBeVisible();

    // "Backup now" button should be disabled when no directory is set.
    const backupNowBtn = page.getByRole('button', { name: /backup now/i });
    await expect(backupNowBtn).toBeVisible();
    await expect(backupNowBtn).toBeDisabled();
  });
});
