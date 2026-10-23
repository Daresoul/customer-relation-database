import { describe, it, expect } from 'vitest';
import { formatLastResult, describeSerialStatus, describeFolderStatus } from '../deviceHealth';
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
      'health.lastResultOn {"date":"21.10.","time":"08:05"}',
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
