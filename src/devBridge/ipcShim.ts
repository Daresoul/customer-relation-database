export const BRIDGE_URL = 'http://127.0.0.1:1421';

export function bridgeRequested(_search: string, _storage: Storage | undefined): boolean {
  return false;
}

export function installIpcShim(
  _win: Window,
  _fetchImpl: typeof fetch = fetch,
  _EventSourceImpl: typeof EventSource = EventSource,
  _url: string = BRIDGE_URL,
): void {}
