/**
 * True inside the Tauri webview. Tauri always injects the IPC bridge, even
 * with `withGlobalTauri` off, so this does not need the global Tauri object.
 */
export const isTauri = (): boolean =>
  typeof (window as Window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__ === 'function';
