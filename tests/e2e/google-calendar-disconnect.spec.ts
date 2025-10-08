// T016: Disconnect E2E test
// This test MUST FAIL initially (UI not implemented)

import { test, expect } from '@playwright/test';

test.describe('Google Calendar Disconnect', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Setup connected state
    await page.goto('/settings/appointments');
  });

  test('should disconnect Google Calendar', async ({ page }) => {
    // This test will FAIL until disconnect flow is implemented

    // Verify currently connected
    await expect(page.getByText(/Connected/i)).toBeVisible();

    // Find and click Disconnect button
    const disconnectButton = page.getByRole('button', { name: /Disconnect/i });
    await expect(disconnectButton).toBeVisible();
    await disconnectButton.click();

    // Verify confirmation modal appears
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Are you sure/i)).toBeVisible();
    await expect(page.getByText(/will stop syncing/i)).toBeVisible();

    // Confirm disconnect
    const confirmButton = page.getByRole('button', { name: /Confirm|Yes|Disconnect/i });
    await confirmButton.click();

    // TODO: Verify API call was made
    // Should call disconnect_google_calendar()

    // Verify success notification
    await expect(page.getByText(/Disconnected/i)).toBeVisible();

    // Verify status changes to "Not Connected"
    await expect(page.getByText(/Not Connected/i)).toBeVisible();

    // Verify email is no longer shown
    await expect(page.getByText(/@gmail\.com/i)).not.toBeVisible();

    // Verify sync toggle is now disabled
    const syncToggle = page.getByRole('switch', { name: /Enable Google Calendar Sync/i });
    await expect(syncToggle).toBeDisabled();

    // Verify Connect button is available again
    const connectButton = page.getByRole('button', { name: /Connect Google Calendar/i });
    await expect(connectButton).toBeVisible();
  });

  test('should cancel disconnect when clicking cancel', async ({ page }) => {
    // This test will FAIL until cancel handling is implemented

    const disconnectButton = page.getByRole('button', { name: /Disconnect/i });
    await disconnectButton.click();

    // Verify confirmation modal appears
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click Cancel
    const cancelButton = page.getByRole('button', { name: /Cancel/i });
    await cancelButton.click();

    // Verify modal is closed
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify still connected
    await expect(page.getByText(/Connected/i)).toBeVisible();

    // Verify no API call was made (still shows connected email)
    await expect(page.getByText(/@gmail\.com/i)).toBeVisible();
  });

  test('should show error if disconnect fails', async ({ page }) => {
    // This test will FAIL until error handling is implemented

    // TODO: Mock API to return error
    const disconnectButton = page.getByRole('button', { name: /Disconnect/i });
    await disconnectButton.click();

    const confirmButton = page.getByRole('button', { name: /Confirm|Yes|Disconnect/i });
    await confirmButton.click();

    // Verify error notification appears
    await expect(page.getByText(/Failed|Error/i)).toBeVisible();

    // Verify still shows connected (state didn't change)
    await expect(page.getByText(/Connected/i)).toBeVisible();
  });

  test('should explain what happens when disconnecting', async ({ page }) => {
    // This test will FAIL until confirmation modal content is implemented

    const disconnectButton = page.getByRole('button', { name: /Disconnect/i });
    await disconnectButton.click();

    const modal = page.getByRole('dialog');

    // Verify explanation of what happens
    await expect(modal.getByText(/Existing events.*remain/i)).toBeVisible();
    await expect(modal.getByText(/stop syncing/i)).toBeVisible();
    await expect(modal.getByText(/re-connect.*any time/i)).toBeVisible();
  });

  test('should hide disconnect button when not connected', async ({ page }) => {
    // This test will FAIL until conditional rendering is implemented

    // TODO: Mock disconnected state
    await page.goto('/settings/appointments');

    // Verify Disconnect button is not visible
    const disconnectButton = page.getByRole('button', { name: /Disconnect/i });
    await expect(disconnectButton).not.toBeVisible();

    // Verify only Connect button is shown
    const connectButton = page.getByRole('button', { name: /Connect Google Calendar/i });
    await expect(connectButton).toBeVisible();
  });
});
