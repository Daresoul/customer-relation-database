/**
 * Wrapped `invoke` for Tauri commands.
 *
 * Drop-in replacement for `@tauri-apps/api/tauri`'s `invoke` that quietly
 * reports any rejected promise to Sentry with command/args context, then
 * re-throws so existing error handling continues to work unchanged.
 *
 * Use this instead of importing from `@tauri-apps/api/tauri` so error
 * reporting is automatic and the user never needs to think about it.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/tauri';
import * as Sentry from '@sentry/react';

export async function invoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag('tauri.command', command);
      scope.setContext('tauri', {
        command,
        args: args ?? null,
        errorType: typeof error,
      });
      const msg =
        typeof error === 'string'
          ? error
          : (error as { message?: string })?.message ?? JSON.stringify(error);
      Sentry.captureException(new Error(`Tauri ${command}: ${msg}`));
    });
    throw error;
  }
}

// Pass-through re-export so callers that also import convertFileSrc don't need
// to keep two separate imports.
export { convertFileSrc } from '@tauri-apps/api/tauri';
