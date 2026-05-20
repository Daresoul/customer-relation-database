/**
 * Chip-only patient creation via the inline DeviceImportModal flow.
 *
 * Migration 041 dropped the NOT NULL constraint on patients.name and
 * patients.species_id so a microchip-on-its-own row is valid. This is the
 * "stray pet brought in, scan first, fill later" workflow. The drift
 * surface is:
 *   - CreatePatientSection's `namingRequired` toggle (frontend client-side
 *     rule that name is only required when chip is empty)
 *   - PatientService::create accepting both fields as null when chip is set
 *
 * The Layer 1 ts-rs types make `name` and `speciesId` Optional, but only
 * exercising the end-to-end flow proves the client-side form rules also
 * permit submission without them.
 */

import { browser, $, expect } from '@wdio/globals';

describe('Chip-only patient creation (inline modal flow)', () => {
  it('emits a device-data event, expands the inline form, submits chip-only, and the patient is created', async () => {
    await browser.pause(2500); // boot

    // Unique chip per run so reruns don't collide on the UNIQUE index.
    const uniqueChip = String(Date.now()).slice(-15); // 15-digit "passport" form

    // Trigger the DeviceImportModal by emitting a device-data-received
    // event without `patientIdentifier` (the test verifies the inline
    // create flow, not the auto-resolution path).
    const fileName = `wdio-chip-only-${Date.now()}.xml`;
    await browser.execute(
      (payload) => {
        const tauri = (window as unknown as {
          __TAURI__?: { event?: { emit?: (e: string, payload: unknown) => Promise<unknown> } };
        }).__TAURI__;
        if (!tauri?.event?.emit) throw new Error('No __TAURI__.event.emit');
        return tauri.event.emit('device-data-received', payload);
      },
      {
        deviceType: 'exigo_eos_vet',
        deviceName: 'Exigo Eos Vet',
        connectionMethod: 'file_watch',
        testResults: { hematology: { WBC: '8.5' } },
        originalFileName: fileName,
        fileData: Array.from(new TextEncoder().encode('<test/>')),
        mimeType: 'application/xml',
        detectedAt: new Date().toISOString(),
      },
    );

    // Modal opens automatically on first pending file. Wait for the
    // "Add Patient" expand button inside CreatePatientSection.
    const expandBtn = await $('[data-testid="create-patient-section-expand-btn"]');
    await expandBtn.waitForDisplayed({ timeout: 10_000 });
    await expandBtn.click();

    // Fill ONLY microchip. Name and species are intentionally left blank —
    // the test point is that the form's `namingRequired` rule lets this
    // submission through.
    //
    // We can't use setValue() — wdio types char-by-char, and the inline
    // useBarcodeScanner hook (registered while DeviceImportModal is open)
    // recognizes 13-char fast typing as a scan burst and preventDefault's
    // every keypress, leaving the input empty. Instead, set the value
    // programmatically through the React `value` setter so the scanner
    // doesn't see keydown events at all.
    const chipInput = await $('[data-testid="create-patient-section-microchip-input"]');
    await chipInput.waitForDisplayed({ timeout: 5_000 });
    await browser.execute((value: string) => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="create-patient-section-microchip-input"]',
      );
      if (!input) throw new Error('chip input not found in DOM');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, uniqueChip);
    // Give Form.useWatch a tick to propagate microchipId into namingRequired
    // before validation reads the rules.
    await browser.pause(200);

    // Submit the inline create form. On success, handlePatientCreated()
    // runs → CreatePatientSection collapses → the expand button returns.
    const createBtn = await $('[data-testid="create-patient-section-submit-btn"]');
    await createBtn.waitForClickable({ timeout: 5_000 });
    await createBtn.click();

    // Success signal: the section collapses (expand button back) and the
    // main modal stays open with the new patient pre-selected. If the
    // backend rejects the chip-only DTO (`name` or `speciesId` enforcement
    // regression), validation in the inline form keeps the section open.
    await expandBtn.waitForDisplayed({
      timeout: 15_000,
      timeoutMsg:
        'CreatePatientSection did not collapse back — backend likely rejected the chip-only create_patient (regression in the name/species nullability migration 041 or the namingRequired client-side rule).',
    });

    // Sanity check via the backend: the patient really exists with our chip.
    const found = await browser.execute(async (chip: string) => {
      const tauri = (window as unknown as {
        __TAURI__?: {
          invoke?: (cmd: string, args: unknown) => Promise<unknown>;
          tauri?: { invoke?: (cmd: string, args: unknown) => Promise<unknown> };
        };
      }).__TAURI__;
      const invoke = tauri?.invoke || tauri?.tauri?.invoke;
      if (!invoke) return null;
      return await invoke('resolve_patient_from_identifier', { identifier: chip });
    }, uniqueChip);
    expect((found as { id?: number } | null)?.id).toBeGreaterThan(0);
  });

  after(async () => {
    // Close the modal by navigating away — leaving it open would let
    // state bleed into the next spec in this shared wdio session.
    await browser.url('tauri://localhost/');
    await browser.pause(500);
  });
});
