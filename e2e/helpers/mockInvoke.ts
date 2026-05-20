/**
 * Typed Tauri-invoke mock for Playwright browser-mode E2E.
 *
 * The frontend imports `invoke` from `@/services/invoke` which internally
 * calls `window.__TAURI_IPC__()`. Outside of Tauri there's no IPC, so we
 * stub the bridge at page load time via an init script.
 *
 * Mock return shapes are typed against the generated DTOs in
 * `src/types/generated/` — so a Rust-side rename invalidates the mocks at
 * compile time, preventing the classic "mock lies, prod breaks" drift.
 */

import type { Page } from '@playwright/test';
import type { Patient } from '../../src/types/generated/Patient';
import type { MedicalRecord } from '../../src/types/generated/MedicalRecord';
import type { BackupConfig } from '../../src/types/generated/BackupConfig';
import type { Currency } from '../../src/types/generated/Currency';
import type { AppSettings } from '../../src/types/generated/AppSettings';
import type { SettingsResponse } from '../../src/types/generated/SettingsResponse';

/** A handler returns the value the Tauri command would return. */
export type CommandHandler<TArgs = any, TResult = any> = (args: TArgs) => TResult | Promise<TResult>;

/** Map of command name → handler. Each test composes the subset it needs. */
export type CommandMap = Record<string, CommandHandler>;

/**
 * Install the Tauri stub on the page before any frontend code runs.
 * Captures all invoke calls in `window.__INVOKE_CALLS__` for assertions.
 */
export async function installTauriMock(page: Page, handlers: CommandMap): Promise<void> {
  await page.addInitScript((serializedHandlers) => {
    const commandHandlers: Record<string, (args: any) => any> = {};
    for (const [name, body] of Object.entries(serializedHandlers as Record<string, string>)) {
      // eslint-disable-next-line no-new-func
      commandHandlers[name] = new Function('args', `return (${body})(args);`) as any;
    }

    (window as any).__INVOKE_CALLS__ = [];

    // Tauri 1.x IPC entry. The @tauri-apps/api invoke calls this internally.
    (window as any).__TAURI_IPC__ = function (message: any) {
      const { cmd, callback, error, ...args } = message;
      (window as any).__INVOKE_CALLS__.push({ cmd, args });

      const handler = commandHandlers[cmd];
      const respond = (key: number, value: any) => {
        const cb = (window as any)[`_${key}`];
        if (typeof cb === 'function') cb(value);
      };

      if (!handler) {
        // Unmocked command — fail loudly so tests don't silently pass on undefined behavior
        respond(error, `[mock] no handler for command: ${cmd}`);
        return;
      }

      try {
        const result = handler(args);
        if (result && typeof (result as any).then === 'function') {
          (result as Promise<any>).then(
            (v) => respond(callback, v),
            (e) => respond(error, e instanceof Error ? e.message : String(e)),
          );
        } else {
          respond(callback, result);
        }
      } catch (e) {
        respond(error, e instanceof Error ? e.message : String(e));
      }
    };

    // Identify ourselves as a Tauri context so the frontend's environment
    // checks pass.
    (window as any).__TAURI__ = { invoke: () => { throw new Error('use @tauri-apps/api/tauri'); } };
    (window as any).__TAURI_METADATA__ = { __currentWindow: { label: 'main' }, __windows: [] };
  }, serializeHandlers(handlers));
}

function serializeHandlers(handlers: CommandMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, fn] of Object.entries(handlers)) {
    // Serialize each handler to a string the init-script can re-hydrate.
    // Test code is constrained to write self-contained handlers — no closures
    // over outer variables. Use `args.foo` for inputs.
    out[name] = fn.toString();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reusable fixture builders — typed against generated DTOs
// ---------------------------------------------------------------------------

export function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 1,
    name: 'Rex',
    speciesId: 1,
    breedId: null,
    species: 'Dog',
    breed: null,
    gender: 'Male',
    dateOfBirth: '2020-05-01',
    color: null,
    weight: 12.5,
    microchipId: null,
    medicalNotes: null,
    isActive: true,
    householdId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeChipOnlyPatient(microchip: string, id = 2): Patient {
  return makePatient({
    id,
    name: null,
    speciesId: null,
    species: null,
    gender: null,
    microchipId: microchip,
  });
}

export function makeMedicalRecord(overrides: Partial<MedicalRecord> = {}): MedicalRecord {
  return {
    id: 100,
    patientId: 1,
    recordType: 'procedure',
    name: 'Annual checkup',
    procedureName: null,
    description: 'Routine examination',
    prescriptionNotes: null,
    price: null,
    currencyId: null,
    discountPercent: null,
    manualTotal: null,
    invoiceNumber: null,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    updatedBy: null,
    version: 1,
    attachments: null,
    lineItems: null,
    ...overrides,
  };
}

export function makeBackupConfig(overrides: Partial<BackupConfig> = {}): BackupConfig {
  return {
    directory: null,
    lastBackupAt: null,
    lastError: null,
    ...overrides,
  };
}

/**
 * The minimum set of stubbed command handlers needed for the app to boot
 * without errors. Tests spread these and override only the commands their
 * specific scenario needs.
 *
 * Each handler is self-contained (no closures over outer vars) so the
 * `toString()` serialization survives the round-trip into the page context.
 */
export function defaultMocks(): CommandMap {
  return {
    // Dashboard
    get_dashboard_stats: () => ({
      total_patients: 0,
      active_patients: 0,
      total_households: 0,
      total_medical_records: 0,
    }),
    get_patients: () => [],
    search_patients: () => [],
    search_households: () => ({ results: [], total: 0, hasMore: false }),
    quick_search_households: () => [],
    get_all_households: () => [],
    // Settings + reference data
    get_app_settings: () => ({
      settings: {
        id: 1, userId: 'default', language: 'en', currencyId: 1, theme: 'light',
        dateFormat: 'MM/DD/YYYY', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      },
      currency: { id: 1, code: 'USD', name: 'US Dollar', symbol: '$' },
    }),
    get_currencies: () => [{ id: 1, code: 'USD', name: 'US Dollar', symbol: '$' }],
    get_species: () => [
      { id: 1, name: 'Dog', active: true, displayOrder: 1, color: '#3498db' },
      { id: 2, name: 'Cat', active: true, displayOrder: 2, color: '#e67e22' },
    ],
    get_breeds: () => [],
    get_view_preference: () => null,
    // Background services
    get_backup_config: () => ({ directory: null, lastBackupAt: null, lastError: null }),
    get_pending_device_entries: () => [],
    list_pending_device_entries: () => [],
    get_device_integrations: () => [],
    get_file_watcher_statuses: () => [],
    get_device_connection_statuses: () => [],
    get_update_preferences: () => ({ autoCheckEnabled: false, lastCheckTimestamp: null }),
    // Appointments (calendar excluded from L2 coverage but the page calls these)
    get_appointments: () => [],
    get_rooms: () => [],
    get_record_templates: () => [],
    search_record_templates: () => [],
    get_line_item_templates: () => [],
  };
}

export function makeDefaultSettings(): SettingsResponse {
  const settings: AppSettings = {
    id: 1,
    userId: 'default',
    language: 'en',
    currencyId: 1,
    theme: 'light',
    dateFormat: 'MM/DD/YYYY',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const currency: Currency = { id: 1, code: 'USD', name: 'US Dollar', symbol: '$' };
  return { settings, currency };
}
