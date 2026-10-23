/**
 * Dev only: lets the app run in a plain browser (Playwright) against the
 * real backend. Every Tauri IPC message goes to the dev bridge
 * (`services::dev_bridge` in the Rust app, started with
 * ARKIVET_DEV_BRIDGE=1), which replays it in the app's hidden window.
 * Event listeners become a server-sent-event stream from the bridge.
 */

export const BRIDGE_URL = 'http://127.0.0.1:1421';

const STORAGE_KEY = 'arkivet-dev-bridge';

interface IpcMessage {
  cmd: string;
  callback: number;
  error: number;
  [key: string]: unknown;
}

interface EventMessage {
  cmd: string;
  event: string;
  handler?: number;
  eventId?: number;
}

type ShimWindow = Window & Record<string, unknown>;

/** `?bridge=1` turns the bridge on for this tab, `?bridge=0` turns it off. */
export function bridgeRequested(search: string, storage: Storage | undefined): boolean {
  const flag = new URLSearchParams(search).get('bridge');
  try {
    if (flag === '1') storage?.setItem(STORAGE_KEY, '1');
    if (flag === '0') storage?.removeItem(STORAGE_KEY);
    if (flag !== null) return flag === '1';
    return storage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return flag === '1';
  }
}

/** Dev builds only, when asked, and never inside the real Tauri webview. */
export function shouldInstallBridge(
  isDev: boolean,
  search: string,
  storage: Storage | undefined,
  win: Window,
): boolean {
  if (!isDev) return false;
  if (typeof (win as ShimWindow).__TAURI_IPC__ === 'function') return false;
  return bridgeRequested(search, storage);
}

export function installIpcShim(
  win: Window,
  fetchImpl: typeof fetch = fetch,
  EventSourceImpl: typeof EventSource = EventSource,
  url: string = BRIDGE_URL,
): void {
  const w = win as ShimWindow;
  // event name -> (listener id -> handler callback id)
  const listeners = new Map<string, Map<number, number>>();
  let stream: EventSource | null = null;
  let nextListenerId = 1;

  const resolve = (callbackId: number, value: unknown) => {
    const fn = w[`_${callbackId}`];
    if (typeof fn === 'function') fn(value);
  };

  const post = (path: string, body: unknown) =>
    fetchImpl(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const openStream = () => {
    if (stream) return;
    stream = new EventSourceImpl(`${url}/events`);
    stream.onmessage = (message: MessageEvent<string> | { data: string }) => {
      const { event, payload } = JSON.parse(message.data) as { event: string; payload: unknown };
      listeners.get(event)?.forEach((handler, id) => resolve(handler, { event, windowLabel: null, payload, id }));
    };
  };

  const handleEvent = (message: EventMessage, callback: number, error: number): boolean => {
    if (message.cmd === 'listen' && typeof message.handler === 'number') {
      openStream();
      const id = nextListenerId++;
      const byId = listeners.get(message.event) ?? new Map<number, number>();
      byId.set(id, message.handler);
      listeners.set(message.event, byId);
      post('/subscribe', { event: message.event })
        .then(() => resolve(callback, id))
        .catch((e: unknown) => resolve(error, `dev bridge unreachable: ${String(e)}`));
      return true;
    }
    if (message.cmd === 'unlisten') {
      listeners.get(message.event)?.delete(message.eventId ?? -1);
      resolve(callback, null);
      return true;
    }
    return false;
  };

  w.__TAURI_IPC__ = (message: IpcMessage) => {
    const { callback, error, ...rest } = message;
    if (rest.cmd === 'tauri' && rest.__tauriModule === 'Event') {
      if (handleEvent(rest.message as EventMessage, callback, error)) return;
    }
    post('/invoke', rest)
      .then((response) => response.json() as Promise<{ ok: boolean; payload: unknown }>)
      .then((reply) => resolve(reply.ok ? callback : error, reply.payload))
      .catch((e: unknown) => resolve(error, `dev bridge unreachable at ${url}: ${String(e)}`));
  };

  if (!w.__TAURI_METADATA__) {
    w.__TAURI_METADATA__ = { __windows: [{ label: 'main' }], __currentWindow: { label: 'main' } };
  }
}
