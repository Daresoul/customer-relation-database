// T014: OAuth E2E test
// This test MUST FAIL initially (UI not implemented)

import { test, expect } from '@playwright/test';

test.describe('Google Calendar OAuth Flow', () => {
  test('should connect to Google Calendar', async ({ page }) => {
    // This test will FAIL until UI is implemented

    // Navigate to Settings page
    await page.goto('/settings/appointments');

    // Verify Connect button exists
    const connectButton = page.getByRole('button', { name: /Connect Google Calendar/i });
    await expect(connectButton).toBeVisible();

    // TODO: Mock OAuth flow
    // Click Connect button
    await connectButton.click();

    // TODO: Wait for OAuth window/flow to complete (mocked)
    // In real implementation, this would:
    // 1. Open browser with auth URL
    // 2. User authorizes
    // 3. Callback triggers
    // 4. Frontend shows "Connected" status

    // Verify connection status changes to "Connected"
    await expect(page.getByText(/Connected/i)).toBeVisible({ timeout: 10000 });

    // Verify connected email is shown
    await expect(page.getByText(/@gmail\.com/i)).toBeVisible();

    // Verify sync toggle is now enabled
    const syncToggle = page.getByRole('switch', { name: /Enable Google Calendar Sync/i });
    await expect(syncToggle).toBeEnabled();

    // This test will fail because the OAuth flow is not yet implemented
  });

  test('should handle OAuth cancellation', async ({ page }) => {
    // This test will FAIL until cancellation handling is implemented

    await page.goto('/settings/appointments');

    const connectButton = page.getByRole('button', { name: /Connect Google Calendar/i });
    await connectButton.click();

    // TODO: Mock user cancelling OAuth flow
    // Simulate cancellation (close window, deny access, etc.)

    // Verify error notification appears
    await expect(page.getByText(/cancelled|denied/i)).toBeVisible();

    // Verify still shows "Not Connected"
    await expect(page.getByText(/Not Connected/i)).toBeVisible();

    // Verify Connect button is still available
    await expect(connectButton).toBeVisible();
  });

  test('should show loading state during OAuth', async ({ page }) => {
    // This test will FAIL until loading states are implemented

    await page.goto('/settings/appointments');

    const connectButton = page.getByRole('button', { name: /Connect Google Calendar/i });
    await connectButton.click();

    // TODO: Verify loading indicator appears
    // await expect(page.getByRole('progressbar')).toBeVisible();
    // OR
    // await expect(connectButton).toBeDisabled();
    // await expect(page.getByText(/Connecting/i)).toBeVisible();
  });
});
