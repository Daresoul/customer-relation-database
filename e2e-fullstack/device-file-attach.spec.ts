/**
 * Device-file → patient attach round-trip.
 *
 * Simulates what happens in production when a device drops a file into the
 * watched directory:
 *   1. Backend file_watcher emits `device-data-received` event
 *   2. Frontend listener (useDeviceDataListener) picks it up
 *   3. DeviceImportContext auto-opens DeviceImportModal
 *   4. User picks a patient + clicks save
 *   5. Backend creates a medical record + uploads the file blob
 *
 * For the test we bypass the file watcher and emit the event directly from
 * the page via `window.__TAURI__.event.emit`. The frontend flow is the real
 * drift surface; the file-watcher → emit hop is covered by Rust unit tests.
 *
 * Filename sorts after `patient-roundtrip.spec.ts` so the patient created
 * by that spec is available — but this spec creates its own patient via
 * direct invoke in `before` so it's safe to run standalone.
 */

import { browser, $, expect } from '@wdio/globals';

interface DeviceDataPayload {
  deviceType: string;
  deviceName: string;
  connectionMethod: string;
  patientIdentifier?: string;
  testResults: unknown;
  originalFileName: string;
  fileData: number[];
  mimeType: string;
  detectedAt: string;
}

describe('Device file → patient attach round-trip', () => {
  let testPatientName: string;

  before(async () => {
    await browser.pause(2500); // boot

    // Create a patient via the IPC bridge so this spec doesn't depend on
    // PatientFormWithOwner working. If it breaks, the patient round-trip
    // spec will catch it; here we just need a row to attach to.
    testPatientName = `WDIO-FileAttach-${Date.now()}`;
    const created = await browser.execute(async (name: string) => {
      const tauri = (window as unknown as {
        __TAURI__?: {
          invoke?: (cmd: string, args: unknown) => Promise<unknown>;
          tauri?: { invoke?: (cmd: string, args: unknown) => Promise<unknown> };
        };
      }).__TAURI__;
      if (!tauri) throw new Error('window.__TAURI__ not available — set withGlobalTauri: true');
      const invoke = tauri.invoke || tauri.tauri?.invoke;
      if (!invoke) throw new Error('No invoke on __TAURI__');
      return await invoke('create_patient', {
        dto: {
          name,
          speciesId: 1, // Dog (seeded by migration 004)
          householdId: null,
          breedId: null,
          dateOfBirth: null,
          gender: null,
          weight: null,
          color: null,
          microchipId: null,
        },
      });
    }, testPatientName);
    expect((created as { id?: number })?.id).toBeGreaterThan(0);
  });

  it('emits a device file event, attaches it to a patient, and saves', async () => {
    const fileName = `wdio-test-${Date.now()}.xml`;
    const payload: DeviceDataPayload = {
      deviceType: 'exigo_eos_vet',
      deviceName: 'Exigo Eos Vet',
      connectionMethod: 'file_watch',
      testResults: { hematology: { WBC: '8.5' } },
      originalFileName: fileName,
      // Tauri serializes Uint8Array poorly; pass as plain number[] (matches
      // the DeviceDataPayload type the backend already emits).
      fileData: Array.from(new TextEncoder().encode('<test>data</test>')),
      mimeType: 'application/xml',
      detectedAt: new Date().toISOString(),
    };

    // Emit the event the way the backend file_watcher would.
    await browser.execute((p: DeviceDataPayload) => {
      const tauri = (window as unknown as {
        __TAURI__?: { event?: { emit?: (e: string, payload: unknown) => Promise<unknown> } };
      }).__TAURI__;
      if (!tauri?.event?.emit) throw new Error('No __TAURI__.event.emit');
      return tauri.event.emit('device-data-received', p);
    }, payload);

    // Modal auto-opens when the first pending file arrives. Wait for the
    // submit button — most stable element inside the modal.
    const submitBtn = await $('[data-testid="device-import-submit-btn"]');
    await submitBtn.waitForDisplayed({ timeout: 10_000 });

    // Pick the patient we created in `before`. The Select renders a search
    // input + options portal; clicking the trigger opens the dropdown.
    const patientTrigger = await $('[data-testid="device-import-patient-select"] .ant-select-selector');
    await patientTrigger.click();
    await browser.pause(400);

    // Options are rendered in a portal at body level. Match by visible text
    // which is "<name> - <species>" per the Option in DeviceImportModal.
    const patientOption = await $(
      `//div[contains(@class, "ant-select-item-option-content") and contains(., "${testPatientName}")]`,
    );
    await patientOption.waitForDisplayed({ timeout: 5_000 });
    await patientOption.click();
    // Let AntD Select onChange propagate into the Form state before
    // we submit — without this validateFields() can race and see
    // patientId as undefined.
    await browser.pause(400);

    // Record name + description are pre-filled by the modal from
    // pendingFiles.deviceName/fileName — no further interaction needed.
    await submitBtn.click();

    // Success path: on a successful save the modal navigates to
    // /medical-records/<id>. The notification.success fires too but
    // gets torn down by the navigation before we can poll it, so we
    // assert on the URL change instead (more robust).
    await browser.waitUntil(
      async () => {
        const url = await browser.getUrl();
        return /\/medical-records\/\d+/.test(url);
      },
      {
        timeout: 20_000,
        timeoutMsg:
          'URL did not navigate to /medical-records/<id> within 20s — submit likely failed. Possible causes: CreateMedicalRecordInput contract drift, upload_attachment failure, or form validation error.',
      },
    );
  });
});
