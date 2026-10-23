/**
 * Wrapped `invoke` for Tauri commands.
 *
 * Drop-in replacement for `@tauri-apps/api/tauri`'s `invoke` that forwards
 * any rejected promise to the Rust-side `log_event` command (which emits
 * a structured telemetry event through tauri-plugin-log → vet-clinic.log
 * → Loki). The original error is re-thrown so existing handling at call
 * sites continues to work unchanged.
 *
 * Only the command name, error message and duration are reported. Args
 * carry client data and file bytes, so they never leave the frontend.
 *
 * A command that has not answered after `DEFAULT_INVOKE_TIMEOUT_MS` is
 * rejected with a translated message. In Tauri v1 a panic inside an async
 * command leaves its promise pending forever, so without this the screen
 * would spin with no way out. Commands that legitimately take minutes
 * (backups, PDFs, imports, Google sign-in) are never timed out.
 *
 * Use this instead of importing from `@tauri-apps/api/tauri` so error
 * reporting is automatic and the user never needs to think about it.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/tauri';
import i18n from 'i18next';

const MAX_MESSAGE_LENGTH = 1_000;

export const DEFAULT_INVOKE_TIMEOUT_MS = 60_000;

/** Run Java, copy many files, move large bytes, or wait for a person. */
const NO_TIMEOUT_COMMANDS = new Set([
  'run_backup_now',
  'create_medical_record',
  'update_medical_record',
  'regenerate_record_document',
  'regenerate_pdf_from_attachment',
  'regenerate_pdf_from_medical_record',
  'generate_configured_report',
  'attach_lab_result',
  'move_lab_result',
  'upload_medical_attachment',
  'download_medical_attachment',
  'materialize_medical_attachment',
  'write_medical_attachment_to_path',
  'print_medical_attachment',
  'render_medical_attachment_pdf_thumbnail',
  'render_medical_attachment_pdf_thumbnail_force',
  'render_medical_attachment_pdf_page_png',
  'start_oauth_flow',
  'complete_oauth_flow',
  'trigger_manual_sync',
  'rebuild_household_search_index',
  'cleanup_orphaned_files',
  'populate_database',
  'reset_database',
  'wipe_database_data',
]);

class CommandTimeout {
  constructor(readonly afterMs: number) {}
}

function withTimeout<T>(command: string, call: Promise<T>): Promise<T> {
  if (NO_TIMEOUT_COMMANDS.has(command)) return call;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new CommandTimeout(DEFAULT_INVOKE_TIMEOUT_MS)),
      DEFAULT_INVOKE_TIMEOUT_MS,
    );
  });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

function reportFailure(command: string, message: string, durationMs: number, errorType: string): void {
  // Fire-and-forget: don't await, and catch any failure of log_event
  // itself. We must not let a reporting failure shadow the real error
  // the caller is about to receive.
  tauriInvoke('log_event', {
    input: {
      level: 'error',
      subsystem: 'tauri.invoke',
      message: `Tauri ${command}: ${message}`,
      extras: { command, durationMs, errorType },
    },
  }).catch(() => {});
}

export async function invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await withTimeout(command, tauriInvoke<T>(command, args));
  } catch (error) {
    if (error instanceof CommandTimeout) {
      const seconds = error.afterMs / 1000;
      reportFailure(command, `timed out after ${seconds} s`, error.afterMs, 'timeout');
      throw i18n.t('errors:commandTimeout', { seconds });
    }
    const durationMs = Math.round(performance.now() - startedAt);
    const fullMsg = String(
      typeof error === 'string'
        ? error
        : (error as { message?: string })?.message ?? JSON.stringify(error),
    );
    const msg =
      fullMsg.length > MAX_MESSAGE_LENGTH
        ? `${fullMsg.slice(0, MAX_MESSAGE_LENGTH)}…`
        : fullMsg;
    reportFailure(command, msg, durationMs, typeof error);
    throw error;
  }
}

// Pass-through re-export so callers that also import convertFileSrc don't need
// to keep two separate imports.
export { convertFileSrc } from '@tauri-apps/api/tauri';
