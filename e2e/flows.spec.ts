/**
 * Layer 2 happy-path E2E covering the recently-added flows.
 *
 * Each test asserts at the IPC boundary — what commands the UI calls and
 * with what args — rather than scraping rendered DOM strings. Selector-based
 * assertions on antd/i18n output are brittle; invoke-call assertions are
 * stable and directly verify the contract between frontend and backend.
 *
 * Full-stack DOM behavior is covered by the WebdriverIO Layer 3 suite once
 * the Windows runner is online.
 */

import { test, expect } from '@playwright/test';
import { installTauriMock, defaultMocks } from './helpers/mockInvoke';

async function waitForBoot(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Drain initial-load invoke calls so test-specific calls are easy to spot.
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    (window as any).__INVOKE_CALLS__ = [];
  });
}

async function getCalls(page: import('@playwright/test').Page) {
  return await page.evaluate(() => (window as any).__INVOKE_CALLS__ as any[]);
}

// ---------------------------------------------------------------------------
// Scan with match → auto-select patient
// ---------------------------------------------------------------------------

test.describe('Scan microchip — patient exists', () => {
  test('scan triggers backend search with normalized 15-digit code', async ({ page }) => {
    await installTauriMock(page, {
      ...defaultMocks(),
      // Pretend the chip belongs to a registered patient
      get_patients: () => [{
        id: 42, name: 'Rex', speciesId: 1, breedId: null, species: 'Dog', breed: null,
        gender: 'Male', dateOfBirth: '2020-01-01', color: null, weight: 12.5,
        microchipId: '807010000007678', medicalNotes: null, isActive: true,
        householdId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      }],
      search_patients: (args: any) => {
        // Returns the matching patient when the chip query comes in
        if (args && args.query === '807010000007678') {
          return [{
            id: 42, name: 'Rex', speciesId: 1, breedId: null, species: 'Dog', breed: null,
            gender: 'Male', dateOfBirth: '2020-01-01', color: null, weight: 12.5,
            microchipId: '807010000007678', medicalNotes: null, isActive: true,
            householdId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
          }];
        }
        return [];
      },
    });

    await waitForBoot(page);

    // Simulate the scanner — 12 hex chars at scanner speed (<50ms inter-key)
    await page.keyboard.type('C9C2540C01FE', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const calls = await getCalls(page);
    const search = calls.find((c) => c.cmd === 'search_patients');
    expect(search, 'scan must trigger backend search').toBeTruthy();
    expect(search.args.query).toBe('807010000007678');
  });
});

// ---------------------------------------------------------------------------
// Scan with no match — list filters down (UI signal that "no patient found")
// ---------------------------------------------------------------------------

test.describe('Scan microchip — no patient match', () => {
  test('scan with unknown chip triggers search that returns empty', async ({ page }) => {
    let searchedCode: string | null = null;
    await installTauriMock(page, {
      ...defaultMocks(),
      // Return empty for the unknown chip
      search_patients: () => [],
    });

    await waitForBoot(page);

    await page.keyboard.type('C9C2540C01FE', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const calls = await getCalls(page);
    const search = calls.find((c) => c.cmd === 'search_patients');
    expect(search).toBeTruthy();
    expect(search.args.query).toBe('807010000007678');
    // Verify the search was made with the normalized form, not raw hex
    expect(search.args.query).not.toBe('C9C2540C01FE');
  });
});

// ---------------------------------------------------------------------------
// Dedup — fast back-to-back scans count as one
// ---------------------------------------------------------------------------

test.describe('Scan dedup', () => {
  test('scanning the same chip twice fast only fires once', async ({ page }) => {
    await installTauriMock(page, {
      ...defaultMocks(),
      search_patients: () => [],
    });
    await waitForBoot(page);

    // Two scans within the 500ms dedup window
    await page.keyboard.type('C9C2540C01FE', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('C9C2540C01FE', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const calls = await getCalls(page);
    const searches = calls.filter((c) => c.cmd === 'search_patients');
    expect(searches.length).toBeLessThanOrEqual(1);
  });

  test('hex and decimal of the same chip dedup against each other', async ({ page }) => {
    // Dedup is keyed off the normalized form, so the hex scan and decimal
    // scan should count as one.
    await installTauriMock(page, {
      ...defaultMocks(),
      search_patients: () => [],
    });
    await waitForBoot(page);

    await page.keyboard.type('C9C2540C01FE', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('807010000007678', { delay: 10 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const calls = await getCalls(page);
    const searches = calls.filter((c) => c.cmd === 'search_patients');
    expect(searches.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Settings → Backups → choose directory + run backup
// ---------------------------------------------------------------------------

test.describe('Backup flow', () => {
  test('configured backup destination renders directory path', async ({ page }) => {
    await installTauriMock(page, {
      ...defaultMocks(),
      get_backup_config: () => ({
        directory: '/Users/test/MyBackups',
        lastBackupAt: '2026-05-19T10:00:00Z',
        lastError: null,
      }),
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // The Backups tab is in the Settings sidebar. Click it.
    const backupsMenuItem = page.getByRole('menuitem', { name: /backups/i });
    await expect(backupsMenuItem).toBeVisible({ timeout: 10_000 });
    await backupsMenuItem.click();

    // Path is rendered in a <Text code> element
    await expect(page.locator('code', { hasText: '/Users/test/MyBackups' })).toBeVisible();

    // "Backup now" button is enabled when directory is configured
    const backupNowBtn = page.getByRole('button', { name: /backup now/i });
    await expect(backupNowBtn).toBeEnabled();
  });

  test('clicking "Backup now" calls run_backup_now command', async ({ page }) => {
    await installTauriMock(page, {
      ...defaultMocks(),
      get_backup_config: () => ({
        directory: '/tmp/backup',
        lastBackupAt: null,
        lastError: null,
      }),
      run_backup_now: () => ({
        directory: '/tmp/backup',
        lastBackupAt: '2026-05-19T11:00:00Z',
        lastError: null,
      }),
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await page.getByRole('menuitem', { name: /backups/i }).click();
    await page.waitForTimeout(300);

    // Drain pre-existing calls
    await page.evaluate(() => {
      (window as any).__INVOKE_CALLS__ = [];
    });

    const backupNowBtn = page.getByRole('button', { name: /backup now/i });
    await backupNowBtn.click();
    await page.waitForTimeout(300);

    const calls = await getCalls(page);
    const ranBackup = calls.find((c) => c.cmd === 'run_backup_now');
    expect(ranBackup, 'click should invoke run_backup_now').toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Patient list — fail loudly if dashboard skips data fetch
// ---------------------------------------------------------------------------

test.describe('Dashboard data loading', () => {
  test('dashboard fetches patient list + stats on mount', async ({ page }) => {
    await installTauriMock(page, {
      ...defaultMocks(),
      get_patients: () => [{
        id: 1, name: 'Buddy', speciesId: 1, breedId: null, species: 'Dog', breed: null,
        gender: 'Male', dateOfBirth: null, color: null, weight: null,
        microchipId: null, medicalNotes: null, isActive: true, householdId: null,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      }],
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const calls = await getCalls(page);
    expect(calls.find((c) => c.cmd === 'get_patients'), 'dashboard must fetch patients').toBeTruthy();
    expect(calls.find((c) => c.cmd === 'get_dashboard_stats'), 'dashboard must fetch stats').toBeTruthy();
  });
});
