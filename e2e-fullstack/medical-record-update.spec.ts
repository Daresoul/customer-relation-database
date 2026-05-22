/**
 * Medical record update round-trip.
 *
 * Creates a patient + medical record via direct invoke, then drives the
 * detail page UI to edit the description and save. Catches drift in
 * `UpdateMedicalRecordInput` — particularly the `MaybeNull<T>` enum
 * fields, which are easy to get wrong on the JS side.
 *
 * Line items aren't covered yet — the custom-item modal-in-modal flow
 * adds ~5 more required testids for marginal additional drift coverage.
 * Add a follow-up spec if line item DTOs start churning.
 */

import { browser, $, expect } from '@wdio/globals';

describe('Medical record update round-trip', () => {
  let recordId: number;
  const originalDescription = 'Initial description';
  const updatedDescription = `Updated by WDIO ${Date.now()}`;

  before(async () => {
    await browser.pause(2500); // boot

    // Set up: patient → medical record, both via direct invoke so the
    // test isn't coupled to PatientFormWithOwner or DeviceImportModal UI
    // (those are covered by their own specs).
    const result = await browser.execute(
      async (descr: string) => {
        const tauri = (window as unknown as {
          __TAURI__?: {
            invoke?: (cmd: string, args: unknown) => Promise<unknown>;
            tauri?: { invoke?: (cmd: string, args: unknown) => Promise<unknown> };
          };
        }).__TAURI__;
        if (!tauri) throw new Error('window.__TAURI__ not available');
        const invoke = tauri.invoke || tauri.tauri?.invoke;
        if (!invoke) throw new Error('No invoke on __TAURI__');

        const patient = (await invoke('create_patient', {
          dto: {
            name: `WDIO-MedRecord-${Date.now()}`,
            speciesId: 1, // Dog (migration 004)
            householdId: null,
            breedId: null,
            dateOfBirth: null,
            gender: null,
            weight: null,
            color: null,
            microchipId: null,
          },
        })) as { id: number };

        const record = (await invoke('create_medical_record', {
          input: {
            patientId: patient.id,
            recordType: 'note',
            name: 'WDIO test record',
            description: descr,
            // Optional fields explicitly null so we don't accidentally
            // skip them — Rust will deserialize `null` properly.
            procedureName: null,
            prescriptionNotes: null,
            price: null,
            currencyId: null,
            discountPercent: null,
            manualTotal: null,
            deviceDataList: null,
            lineItems: null,
          },
        })) as { id: number };

        return { patientId: patient.id, recordId: record.id };
      },
      originalDescription,
    );
    recordId = (result as { recordId: number }).recordId;
    expect(recordId).toBeGreaterThan(0);
  });

  it('opens the record, edits the description, saves, and persists the change', async () => {
    // Navigate via window.location — same path the production save-handler
    // uses (`window.location.href = '/medical-records/<id>'`) so we hit the
    // exact path Tauri's protocol handler is known to serve via SPA fallback.
    // browser.url('tauri://...') was giving a blank page (Edit btn never
    // rendered), suggesting the asset protocol doesn't fallback to index.html
    // for arbitrary deep paths when navigated via WebDriver.
    await browser.execute((id: number) => {
      window.location.href = `/medical-records/${id}`;
    }, recordId);
    await browser.pause(3500);

    // Click Edit → switches the card into MedicalRecordForm.
    const editBtn = await $('[data-testid="medical-record-edit-btn"]');
    await editBtn.waitForClickable({ timeout: 10_000 });
    await editBtn.click();

    // The same TextArea testid we added for the device-import flow.
    const descrInput = await $('[data-testid="medical-record-description-input"]');
    await descrInput.waitForDisplayed({ timeout: 5_000 });
    // Set value programmatically — wdio's setValue() on AntD's
    // Input.TextArea with `showCount` doesn't reliably replace the
    // existing value (the form submitted "Initial description" unchanged
    // even after a clear+sendKeys). Bypass the input pipeline entirely.
    await browser.execute((value: string) => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="medical-record-description-input"]',
      );
      if (!ta) throw new Error('description textarea not found');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(ta, value);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, updatedDescription);
    await browser.pause(200);

    // Save.
    const submitBtn = await $('[data-testid="medical-record-form-submit-btn"]');
    await submitBtn.waitForClickable({ timeout: 5_000 });
    await submitBtn.click();

    // After successful update the form is replaced with the view-mode
    // card and the Edit button reappears. If `update_medical_record`
    // rejected the payload, we'd stay in edit mode and Edit never returns.
    const editAgain = await $('[data-testid="medical-record-edit-btn"]');
    await editAgain.waitForDisplayed({
      timeout: 15_000,
      timeoutMsg:
        'Edit button never reappeared — update_medical_record likely rejected the UpdateMedicalRecordInput (contract drift) or the form failed validation.',
    });

    // Force a fresh fetch by reloading the page. This sidesteps a known
    // refresh issue in MedicalRecordDetail (refetch after update sometimes
    // doesn't propagate the new record into the rendered Paragraph) so the
    // test asserts persistence end-to-end without coupling to React Query's
    // in-memory refresh path. Tracked as a follow-up bug; reload is the
    // realistic UX (vet sees the value after navigating back to the record).
    await browser.execute((id: number) => {
      window.location.href = `/medical-records/${id}`;
    }, recordId);
    await browser.pause(3500); // boot + initial fetch

    await browser.waitUntil(
      async () => {
        const body = await $('body');
        const text = await body.getText().catch(() => '');
        return text.includes(updatedDescription);
      },
      {
        timeout: 10_000,
        interval: 500,
        timeoutMsg: `After reload, updated description "${updatedDescription}" is still not visible on page — backend rejected the UpdateMedicalRecordInput.`,
      },
    );
  });
});
