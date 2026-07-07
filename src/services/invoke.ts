/**
 * Wrapped `invoke` for Tauri commands.
 *
 * Drop-in replacement for `@tauri-apps/api/tauri`'s `invoke` that forwards
 * any rejected promise to the Rust-side `log_event` command (which emits
 * a structured telemetry event through tauri-plugin-log → vet-clinic.log
 * → Loki). The original error is re-thrown so existing handling at call
 * sites continues to work unchanged.
 *
 * Use this instead of importing from `@tauri-apps/api/tauri` so error
 * reporting is automatic and the user never needs to think about it.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/tauri';

export async function invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    const msg =
      typeof error === 'string'
        ? error
        : (error as { message?: string })?.message ?? JSON.stringify(error);

    // Fire-and-forget: don't await, and catch any failure of log_event
    // itself. We must not let a reporting failure shadow the real error
    // the caller is about to receive via the `throw` below.
    tauriInvoke('log_event', {
      input: {
        level: 'error',
        subsystem: 'tauri.invoke',
        message: `Tauri ${command}: ${msg}`,
        extras: {
          command,
          args: args ?? null,
          errorType: typeof error,
        },
      },
    }).catch(() => {});
    throw error;
  }
}

// Pass-through re-export so callers that also import convertFileSrc don't need
// to keep two separate imports.
export { convertFileSrc } from '@tauri-apps/api/tauri';
