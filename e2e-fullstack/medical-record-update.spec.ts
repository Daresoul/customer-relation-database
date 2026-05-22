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

    // The new description should now be on the page (rendered by the view-
    // mode card). Soft assertion — gives a clearer error if pure invoke
    // success happened but the UI didn't re-render with the new value.
    await browser.waitUntil(
      async () => {
        const body = await $('body');
        const text = await body.getText().catch(() => '');
        return text.includes(updatedDescription);
      },
      {
        timeout: 15_000,
        interval: 500,
        timeoutMsg: `Updated description "${updatedDescription}" not visible on page — backend likely accepted but UI didn't refetch.`,
      },
    ).catch(async (renderErr) => {
      // The visual assertion timed out. Disambiguate whether the backend
      // actually got the update or whether the form silently submitted the
      // old value (the second is the AntD-controlled-input gotcha we hit
      // before with showCount TextAreas).
      const dbRecord = await browser.execute(async (id: number) => {
        const tauri = (window as unknown as {
          __TAURI__?: {
            invoke?: (cmd: string, args: unknown) => Promise<unknown>;
            tauri?: { invoke?: (cmd: string, args: unknown) => Promise<unknown> };
          };
        }).__TAURI__;
        const invoke = tauri?.invoke || tauri?.tauri?.invoke;
        // get_medical_record returns MedicalRecordDetail = { record, attachments, history }
        return await invoke!('get_medical_record', { recordId: id, includeHistory: false });
      }, recordId);
      const dbDesc = (dbRecord as { record?: { description?: string } } | undefined)?.record
        ?.description;
      throw new Error(
        `${renderErr.message}\n  → backend description after submit: ${JSON.stringify(dbDesc)}\n` +
          `  → expected: ${JSON.stringify(updatedDescription)}\n` +
          `  → diagnosis: ${
            dbDesc === updatedDescription
              ? 'backend has the new value but UI did not refetch (render issue)'
              : 'form submitted the old value to backend (controlled-input propagation issue)'
          }`,
      );
    });
  });
});
