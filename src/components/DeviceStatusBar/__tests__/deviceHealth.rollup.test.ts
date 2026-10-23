import { describe, it, expect } from 'vitest';
import { folderLevel, rollupHealth, serialLevel } from '../deviceHealth';
import type { DeviceConnectionStatus, FileWatcherStatus } from '../../../types/deviceIntegration';

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
  watch_directory: '/lab',
  status: 'Watching',
  files_processed: 0,
  ...over,
});

describe('device health level', () => {
  it('a connected port works, a first attempt waits, a retrying or failed port is down', () => {
    expect(serialLevel(serial({}))).toBe('working');
    expect(serialLevel(serial({ status: 'Connecting' }))).toBe('waiting');
    expect(serialLevel(serial({ status: 'Connecting', retry_count: 2 }))).toBe('down');
    expect(serialLevel(serial({ status: 'Error', error_kind: 'port_missing' }))).toBe('down');
    expect(serialLevel(undefined)).toBe('waiting');
  });

  it('a watched folder works, a missing one is down, a stopped one waits', () => {
    expect(folderLevel(folder({}))).toBe('working');
    expect(folderLevel(folder({ status: 'Error' }))).toBe('down');
    expect(folderLevel(folder({ status: 'Stopped' }))).toBe('waiting');
    expect(folderLevel(undefined)).toBe('waiting');
  });

  it('rolls up to the worst level and counts the machines at that level', () => {
    expect(rollupHealth([])).toEqual({ level: 'none', count: 0 });
    expect(rollupHealth(['working', 'working'])).toEqual({ level: 'working', count: 0 });
    expect(rollupHealth(['working', 'waiting'])).toEqual({ level: 'waiting', count: 1 });
    expect(rollupHealth(['down', 'waiting', 'down', 'working'])).toEqual({ level: 'down', count: 2 });
  });
});
