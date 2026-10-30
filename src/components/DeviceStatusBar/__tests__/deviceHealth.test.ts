import { describe, it, expect } from 'vitest';
import { formatLastResult, describeSerialStatus, describeFolderStatus, formatToday, formatDownSince } from '../deviceHealth';
import type { DeviceConnectionStatus, FileWatcherStatus } from '../../../types/deviceIntegration';

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key);

const serial = (over: Partial<DeviceConnectionStatus>): DeviceConnectionStatus => ({
  integration_id: 1,
  port_name: 'COM3',
  device_type: 'mnchip_pointcare_chemistry',
  status: 'Connected',
  retry_count: 0,
  ...over,
});

const folder = (over: Partial<FileWatcherStatus>): FileWatcherStatus => ({
  integration_id: 2,
  name: 'Exigo',
  watch_directory: '\\\\LAB-PC\\export',
  status: 'Watching',
  files_processed: 0,
  ...over,
});

describe('formatLastResult', () => {
  it('shows the clock time for a result from today', () => {
    const at = new Date(2026, 9, 23, 10, 42).toISOString();
    expect(formatLastResult(at, new Date(2026, 9, 23, 15, 0), t)).toBe('health.lastResult {"time":"10:42"}');
  });

  it('adds the date for an older result', () => {
    const at = new Date(2026, 9, 21, 8, 5).toISOString();
    expect(formatLastResult(at, new Date(2026, 9, 23, 15, 0), t)).toBe(
      'health.lastResultOn {"date":"21/10","time":"08:05"}',
    );
  });

  it('is empty when no result has arrived yet', () => {
    expect(formatLastResult(undefined, new Date(), t)).toBeNull();
    expect(formatLastResult(null, new Date(), t)).toBeNull();
  });
});

describe('describeSerialStatus', () => {
  it('says what happened and what to do, with the raw error as details', () => {
    const h = describeSerialStatus(
      serial({ status: 'Error', error_kind: 'port_busy', last_error: 'Failed to open port: Access is denied.' }),
      t,
    );
    expect(h.text).toBe('health.kinds.port_busy.title {"port":"COM3"}');
    expect(h.action).toBe('health.kinds.port_busy.action {"port":"COM3"}');
    expect(h.details).toBe('Failed to open port: Access is denied.');
  });

  it('explains an unplugged cable after a lost connection', () => {
    const h = describeSerialStatus(serial({ status: 'Disconnected', error_kind: 'disconnected', last_error: 'x' }), t);
    expect(h.text).toBe('health.kinds.disconnected.title {"port":"COM3"}');
    expect(h.action).toBe('health.kinds.disconnected.action {"port":"COM3"}');
  });

  it('falls back to a general message for an error of unknown kind', () => {
    const h = describeSerialStatus(serial({ status: 'Error', last_error: 'weird' }), t);
    expect(h.text).toBe('health.kinds.unknown.title {"port":"COM3"}');
    expect(h.details).toBe('weird');
  });

  it('says connecting without counting attempts', () => {
    expect(describeSerialStatus(serial({ status: 'Connecting', retry_count: 4 }), t).text).toBe('status.connecting');
  });

  it('explains a listener that stopped on its own', () => {
    const h = describeSerialStatus(serial({ status: 'Error', error_kind: 'listener_stopped' }), t);
    expect(h.text).toBe('health.kinds.listener_stopped.title {"port":"COM3"}');
  });

  it('keeps it short when connected', () => {
    const h = describeSerialStatus(serial({ status: 'Connected' }), t);
    expect(h.text).toBe('status.connected');
    expect(h.action).toBeUndefined();
  });

  it('is unknown without a status', () => {
    expect(describeSerialStatus(undefined, t).text).toBe('status.unknown');
  });
});

describe('describeFolderStatus', () => {
  it('explains a missing folder with what to do', () => {
    const h = describeFolderStatus(
      folder({ status: 'Error', error_kind: 'folder_missing', last_error: 'Directory does not exist: x' }),
      t,
    );
    expect(h.text).toBe('health.kinds.folder_missing.title {"directory":"\\\\\\\\LAB-PC\\\\export"}');
    expect(h.action).toBe('health.kinds.folder_missing.action {"directory":"\\\\\\\\LAB-PC\\\\export"}');
    expect(h.details).toBe('Directory does not exist: x');
  });

  it('says watching when fine', () => {
    expect(describeFolderStatus(folder({}), t).text).toBe('status.watching');
  });
});

// Machine status #5: "Проблеми: 0 денес" after a morning without connection.
describe('outage wording', () => {
  const tt = (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key);

  it('sums up today in minutes and breaks', () => {
    expect(formatToday(0, 0, tt)).toBe('drawer.today.clean');
    expect(formatToday(3, 52, tt)).toBe('drawer.today.down {"time":"52 drawer.minutes","count":3}');
    expect(formatToday(1, 80, tt)).toBe('drawer.today.down {"time":"1 drawer.hours 20 drawer.minutes","count":1}');
  });

  it('says since when it is down, how often it tried and when it tries next', () => {
    const today = (h: number, m: number, sec = 0) => {
      const d = new Date();
      d.setHours(h, m, sec, 0);
      return d.toISOString();
    };
    const since = today(14, 3);
    const next = today(14, 57, 10);
    expect(formatDownSince(since, 182, next, tt)).toBe(
      'drawer.downSince {"time":"14:03"} · drawer.attempts {"count":182} · drawer.nextTry {"time":"14:57:10"}',
    );
    expect(formatDownSince(since, 0, undefined, tt)).toBe('drawer.downSince {"time":"14:03"}');
    expect(formatDownSince(undefined, 3, undefined, tt)).toBeNull();
    const earlier = new Date();
    earlier.setDate(earlier.getDate() - 2);
    earlier.setHours(18, 5, 0, 0);
    expect(formatDownSince(earlier.toISOString(), 0, undefined, tt)).toMatch(/^drawer\.downSince \{"time":"\d\d[./-]\d\d 18:05"\}$/);
  });
});

// Clinic logs: Healvet, PCR and PointCare send nothing between results, so a quiet port is normal.
describe('a connected machine that sends nothing', () => {
  const now = new Date(2026, 9, 24, 17, 0);
  const at = (h: number, m: number) => new Date(2026, 9, 24, h, m).toISOString();

  it.each(['healvet_hv_fia_3000', 'mnchip_pcr_analyzer', 'mnchip_pointcare_chemistry'])('reads plain connected for %s after hours of quiet', (device_type) => {
    const quiet = serial({ status: 'Connected', device_type, last_connected: at(7, 8), last_byte_at: undefined });
    expect(describeSerialStatus(quiet, t, now)).toEqual({ text: 'status.connected' });
  });
});
