// Imported first by main.tsx, so the shim is in place before any Tauri call.
import { installIpcShim, shouldInstallBridge } from './ipcShim';

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

// The DEV check comes first so production builds drop this whole module.
if (import.meta.env.DEV && shouldInstallBridge(true, window.location.search, sessionStore(), window)) {
  installIpcShim(window);
  console.info('[dev bridge] Tauri calls go to the dev bridge at 127.0.0.1:1421');
}
