import { describe, it, expect } from 'vitest';
import { chipText, folderLevel, rollupHealth, serialDownSince, serialLevel } from '../deviceHealth';
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

  // device-health #7: one failed retry turned the chip red at once.
  it('a port that failed less than a minute ago waits; after a minute it is down', () => {
    const t0 = 1_000_000;
    const failing = serial({ status: 'Error', error_kind: 'port_missing', retry_count: 1 });
    expect(serialLevel(failing, t0, t0 + 10_000)).toBe('waiting');
    expect(serialLevel(serial({ status: 'Connecting', retry_count: 3 }), t0, t0 + 59_000)).toBe('waiting');
    expect(serialLevel(failing, t0, t0 + 60_000)).toBe('down');
  });

  it('remembers when a port went down until it works again', () => {
    const id = 9001;
    const failing = serial({ integration_id: id, status: 'Error', error_kind: 'port_missing' });
    expect(serialDownSince(failing, 100)).toBe(100);
    expect(serialDownSince(serial({ integration_id: id, status: 'Connecting', retry_count: 1 }), 5_000)).toBe(100);
    expect(serialDownSince(serial({ integration_id: id }), 9_000)).toBeUndefined();
    expect(serialDownSince(failing, 20_000)).toBe(20_000);
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

  // Machine status #3: "Не работи · 1" made the vet open the panel to learn which one.
  it('the header names the machine when only one needs attention', () => {
    const t = (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key);
    expect(chipText([{ name: 'PointCare', level: 'down' }, { name: 'Exigo', level: 'working' }], t)).toBe(
      'chip.oneDown {"name":"PointCare"}',
    );
    expect(chipText([{ name: 'PointCare', level: 'down' }, { name: 'Healvet', level: 'down' }], t)).toBe(
      'chip.manyDown {"count":2}',
    );
    expect(chipText([{ name: 'PCR', level: 'waiting' }, { name: 'Exigo', level: 'working' }], t)).toBe(
      'chip.oneWaiting {"name":"PCR"}',
    );
    expect(chipText([{ name: 'Exigo', level: 'working' }], t)).toBe('chip.allWorking');
  });
});

