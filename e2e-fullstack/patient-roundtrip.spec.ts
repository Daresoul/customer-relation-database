/**
 * Patient create round-trip — the actual drift-catching test.
 *
 * Drives the real UI (open modal → fill form → submit) and waits for the
 * dashboard list to refresh. If the frontend's CreatePatientInput shape
 * diverges from the Rust DTO, the backend rejects the payload and the new
 * patient never appears in the table — this test fails.
 *
 * This is the canary for boundary drift. The shallow `smoke.spec.ts` only
 * proves the bridge is alive; this one proves the contract still holds.
 *
 * Note: writes a row to the test machine's local SQLite. Each run uses a
 * timestamped name (`WDIO-Test-<epoch>`) so reruns don't collide. The DB
 * accumulates rows over time — that's accepted (it's a test VM, not prod).
 */

import { browser, $, expect } from '@wdio/globals';

describe('Patient create round-trip (full stack)', () => {
  it('creates a patient via UI and shows it in the dashboard list', async () => {
    // Boot grace period — migrations, initial queries, React paint.
    await browser.pause(2500);

    // Ensure the Patients tab is active. The dashboard remembers the last
    // view across launches via get_view_preference, so a previous run could
    // have left it on Households.
    const patientsTab = await $('[data-node-key="patients"]');
    if (await patientsTab.isExisting()) {
      await patientsTab.click();
      await browser.pause(300);
    }

    const uniqueName = `WDIO-Test-${Date.now()}`;

    // Open the create-patient modal.
    const addBtn = await $('[data-testid="add-patient-btn"]');
    await addBtn.waitForClickable({ timeout: 5000 });
    await addBtn.click();

    // Fill name.
    const nameInput = await $('[data-testid="patient-name-input"]');
    await nameInput.waitForDisplayed({ timeout: 5000 });
    await nameInput.setValue(uniqueName);

    // Pick species. SearchableSelect wraps AntD AutoComplete — click the
    // trigger input to open the dropdown, then click the "Dog" option.
    // (Species 'Dog' is seeded by migration 004.)
    const speciesInput = await $('[data-testid="patient-species-select"] input');
    await speciesInput.click();
    await browser.pause(300);

    // Options render in a portal at document.body level. Match by visible text.
    const dogOption = await $('//div[contains(@class, "ant-select-item-option-content") and normalize-space(text())="Dog"]');
    await dogOption.waitForDisplayed({ timeout: 5000 });
    await dogOption.click();

    // Submit.
    const submitBtn = await $('[data-testid="submit-patient-btn"]');
    await submitBtn.waitForClickable({ timeout: 5000 });
    await submitBtn.click();

    // Success notification appears only after invoke('create_patient', ...)
    // resolves OK. This is the round-trip proof — if the frontend's
    // CreatePatientInput diverges from Rust's CreatePatientDto, the backend
    // rejects the payload and notification.error fires instead.
    const successNotice = await $(
      '//div[contains(@class, "ant-notification-notice-description") and contains(text(), "successfully")]',
    );
    await successNotice.waitForDisplayed({
      timeout: 10_000,
      timeoutMsg:
        'Create-patient success notification did not appear within 10s — backend likely rejected the CreatePatientInput (contract drift) or the form failed validation.',
    });

    // After the notification, the dashboard re-fetches patients. With a
    // unique name we don't have to worry about pagination — just confirm
    // the new name made it into the rendered table somewhere within a
    // short window. If pagination hides it, this is a soft check (logged,
    // not failed) — the notification above is the strong assertion.
    let tableShowedName = false;
    try {
      await browser.waitUntil(
        async () => {
          const table = await $('.patient-data-table');
          if (!(await table.isExisting())) return false;
          const text = await table.getText().catch(() => '');
          return text.includes(uniqueName);
        },
        { timeout: 5_000, interval: 250 },
      );
      tableShowedName = true;
    } catch {
      // expected if there are already >10 patients on the test machine
    }
    if (!tableShowedName) {
      console.warn(
        `Note: "${uniqueName}" not on the visible page (likely pagination). Notification confirmed the backend accepted the row.`,
      );
    }
  });
});
