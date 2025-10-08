// T015: Sync toggle E2E test
// This test MUST FAIL initially (UI not implemented)

import { test, expect } from '@playwright/test';

test.describe('Google Calendar Sync Toggle', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Setup connected state
    // In real implementation, this would mock the backend to return connected status
    await page.goto('/settings/appointments');
  });

  test('should toggle sync on and off', async ({ page }) => {
    // This test will FAIL until sync toggle is implemented

    // Find the sync toggle switch
    const syncToggle = page.getByRole('switch', { name: /Enable Google Calendar Sync/i });

    // Verify toggle exists and is initially off
    await expect(syncToggle).toBeVisible();
    await expect(syncToggle).not.toBeChecked();

    // Toggle sync ON
    await syncToggle.click();

    // TODO: Verify API call was made
    // Should call update_sync_enabled(true)

    // Verify toggle is now on
    await expect(syncToggle).toBeChecked();

    // Verify success notification appears
    await expect(page.getByText(/Sync enabled/i)).toBeVisible();

    // Toggle sync OFF
    await syncToggle.click();

    // TODO: Verify API call was made
    // Should call update_sync_enabled(false)

    // Verify toggle is now off
    await expect(syncToggle).not.toBeChecked();

    // Verify notification appears
    await expect(page.getByText(/Sync disabled/i)).toBeVisible();
  });

  test('should show error if toggle fails', async ({ page }) => {
    // This test will FAIL until error handling is implemented

    // TODO: Mock API to return error
    const syncToggle = page.getByRole('switch', { name: /Enable Google Calendar Sync/i });

    await syncToggle.click();

    // Verify error notification appears
    await expect(page.getByText(/Failed|Error/i)).toBeVisible();

    // Verify toggle returns to previous state
    await expect(syncToggle).not.toBeChecked();
  });

  test('should trigger manual sync', async ({ page }) => {
    // This test will FAIL until manual sync button is implemented

    // Enable sync first
    const syncToggle = page.getByRole('switch', { name: /Enable Google Calendar Sync/i });
    await syncToggle.click();

    // Find and click "Sync Now" button
    const syncButton = page.getByRole('button', { name: /Sync Now/i });
    await expect(syncButton).toBeVisible();
    await syncButton.click();

    // TODO: Verify API call was made
    // Should call trigger_manual_sync()

    // Verify loading/progress indicator
    await expect(page.getByText(/Syncing/i)).toBeVisible();

    // Wait for completion
    await expect(page.getByText(/Sync complete/i)).toBeVisible({ timeout: 10000 });

    // Verify sync stats are shown (e.g., "Synced 10 appointments")
    await expect(page.getByText(/Synced \d+ appointment/i)).toBeVisible();
  });

  test('should disable sync toggle when not connected', async ({ page }) => {
    // This test will FAIL until connection state handling is implemented

    // TODO: Mock disconnected state
    // Navigate to page in disconnected state
    await page.goto('/settings/appointments');

    const syncToggle = page.getByRole('switch', { name: /Enable Google Calendar Sync/i });

    // Verify toggle is disabled when not connected
    await expect(syncToggle).toBeDisabled();

    // Verify helper text explains why
    await expect(page.getByText(/Connect Google Calendar first/i)).toBeVisible();
  });

  test('should show last sync time', async ({ page }) => {
    // This test will FAIL until last sync display is implemented

    // TODO: Mock connected state with last_sync timestamp
    await page.goto('/settings/appointments');

    // Verify last sync time is displayed
    await expect(page.getByText(/Last synced:/i)).toBeVisible();
    await expect(page.getByText(/\d+ (minute|hour|day)s? ago/i)).toBeVisible();
  });
});
