/**
 * In a plain browser (Playwright), the IPC shim sends every Tauri call to the
 * dev bridge, which replays it in the real app, and turns event listeners
 * into a server-sent-event stream.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bridgeRequested, installIpcShim } from '../ipcShim';

type Win = Window & Record<string, unknown> & { __TAURI_IPC__: (m: Record<string, unknown>) => void };

class FakeEventSource {
  static last: FakeEventSource | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  emit(event: string, payload: unknown) {
    this.onmessage?.({ data: JSON.stringify({ event, payload }) });
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(reply: { ok: boolean; payload: unknown } | Error = { ok: true, payload: null }) {
  const win = {} as Win;
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (reply instanceof Error) throw reply;
    return { json: async () => reply } as Response;
  });
  installIpcShim(win, fetchMock as unknown as typeof fetch, FakeEventSource as unknown as typeof EventSource, 'http://bridge');
  return { win, fetchMock };
}

function callbacks(win: Win) {
  const ok = vi.fn();
  const err = vi.fn();
  win._11 = ok;
  win._12 = err;
  return { ok, err };
}

describe('ipc shim', () => {
  beforeEach(() => {
    FakeEventSource.last = null;
  });

  it('sends a command to the bridge without the callback ids and resolves it', async () => {
    const { win, fetchMock } = setup({ ok: true, payload: [{ id: 1 }] });
    const { ok, err } = callbacks(win);

    win.__TAURI_IPC__({ cmd: 'get_households', callback: 11, error: 12, limit: 5 });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith('http://bridge/invoke', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ cmd: 'get_households', limit: 5 });
    expect(ok).toHaveBeenCalledWith([{ id: 1 }]);
    expect(err).not.toHaveBeenCalled();
  });

  it('rejects with the backend error', async () => {
    const { win } = setup({ ok: false, payload: 'Patient not found' });
    const { ok, err } = callbacks(win);

    win.__TAURI_IPC__({ cmd: 'get_patient', callback: 11, error: 12, id: 9 });
    await flush();

    expect(err).toHaveBeenCalledWith('Patient not found');
    expect(ok).not.toHaveBeenCalled();
  });

  it('rejects with a clear message when the bridge is not running', async () => {
    const { win } = setup(new TypeError('Failed to fetch'));
    const { err } = callbacks(win);

    win.__TAURI_IPC__({ cmd: 'get_patient', callback: 11, error: 12 });
    await flush();

    expect(err.mock.calls[0][0]).toMatch(/dev bridge/i);
  });

  it('turns an event listener into a bridge subscription and delivers events', async () => {
    const { win, fetchMock } = setup();
    const { ok } = callbacks(win);
    const handler = vi.fn();
    win._50 = handler;

    win.__TAURI_IPC__({
      cmd: 'tauri',
      callback: 11,
      error: 12,
      __tauriModule: 'Event',
      message: { cmd: 'listen', event: 'device-data-received', windowLabel: null, handler: 50 },
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith('http://bridge/subscribe', expect.objectContaining({ method: 'POST' }));
    expect(FakeEventSource.last!.url).toBe('http://bridge/events');
    const eventId = ok.mock.calls[0][0];
    expect(typeof eventId).toBe('number');

    FakeEventSource.last!.emit('device-data-received', { deviceName: 'Healvet' });
    FakeEventSource.last!.emit('device-event', { kind: 'other' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      event: 'device-data-received',
      windowLabel: null,
      payload: { deviceName: 'Healvet' },
      id: eventId,
    });
  });

  it('stops delivering after unlisten', async () => {
    const { win } = setup();
    const { ok } = callbacks(win);
    const handler = vi.fn();
    win._50 = handler;
    const listen = { cmd: 'listen', event: 'device-event', windowLabel: null, handler: 50 };
    win.__TAURI_IPC__({ cmd: 'tauri', callback: 11, error: 12, __tauriModule: 'Event', message: listen });
    await flush();
    const eventId = ok.mock.calls[0][0];

    win._11 = vi.fn();
    win.__TAURI_IPC__({
      cmd: 'tauri',
      callback: 11,
      error: 12,
      __tauriModule: 'Event',
      message: { cmd: 'unlisten', event: 'device-event', eventId },
    });
    FakeEventSource.last!.emit('device-event', { kind: 'parse_failed' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('provides the window metadata the Tauri API reads', () => {
    const { win } = setup();
    expect((win.__TAURI_METADATA__ as { __currentWindow: { label: string } }).__currentWindow.label).toBe('main');
  });
});

describe('bridgeRequested', () => {
  function memoryStorage(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      get length() {
        return m.size;
      },
    };
  }

  it('turns on with ?bridge=1 and stays on for the tab', () => {
    const storage = memoryStorage();
    expect(bridgeRequested('?bridge=1', storage)).toBe(true);
    expect(bridgeRequested('', storage)).toBe(true);
  });

  it('turns off with ?bridge=0', () => {
    const storage = memoryStorage();
    bridgeRequested('?bridge=1', storage);
    expect(bridgeRequested('?bridge=0', storage)).toBe(false);
    expect(bridgeRequested('', storage)).toBe(false);
  });

  it('is off by default and without storage', () => {
    expect(bridgeRequested('', memoryStorage())).toBe(false);
    expect(bridgeRequested('?bridge=1', undefined)).toBe(true);
  });
});
