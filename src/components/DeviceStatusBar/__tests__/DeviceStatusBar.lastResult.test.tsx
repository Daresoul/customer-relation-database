import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('@tauri-apps/api', () => ({ invoke: vi.fn().mockResolvedValue(['COM3']) }));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn().mockResolvedValue([]) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));

const today = new Date();
const lastResultAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 42).toISOString();

vi.mock('../../../hooks/useDeviceIntegrations', () => ({
  useDeviceIntegrations: () => ({
    data: [
      { id: 1, name: 'PointCare', deviceType: 'mnchip_pointcare_chemistry', connectionType: 'serial_port', serialPortName: 'COM3', enabled: true },
      { id: 2, name: 'Exigo', deviceType: 'exigo_eos_vet', connectionType: 'file_watch', watchDirectory: '/lab', filePattern: '*.xml', enabled: true },
    ],
    isLoading: false,
  }),
  useDeviceConnectionStatus: () => ({
    getStatus: () => ({
      integration_id: 1,
      port_name: 'COM3',
      device_type: 'mnchip_pointcare_chemistry',
      status: 'Connected',
      retry_count: 0,
      last_result_at: lastResultAt,
    }),
    refetch: vi.fn(),
  }),
  useFileWatcherStatus: () => ({
    getStatus: () => ({
      integration_id: 2,
      name: 'Exigo',
      watch_directory: '/lab',
      status: 'Watching',
      files_processed: 0,
      last_result_at: null,
    }),
  }),
}));

vi.mock('../../DevTools', () => ({ DevToolsDrawer: () => null }));

afterEach(() => cleanup());

describe('device status chips', () => {
  it('shows the last result time next to the device on the dashboard bar', async () => {
    const { DeviceStatusBar } = await import('../DeviceStatusBar');
    render(
      <MemoryRouter initialEntries={['/']}>
        <App>
          <DeviceStatusBar />
        </App>
      </MemoryRouter>,
    );
    expect(await screen.findByText('health.lastResult {"time":"10:42"}')).toBeInTheDocument();
  });

  it('shows the last result time on the compact chips too', async () => {
    const { DeviceStatusInline } = await import('../DeviceStatusInline');
    render(
      <MemoryRouter>
        <DeviceStatusInline />
      </MemoryRouter>,
    );
    expect(await screen.findByText('health.lastResult {"time":"10:42"}')).toBeInTheDocument();
  });
});
