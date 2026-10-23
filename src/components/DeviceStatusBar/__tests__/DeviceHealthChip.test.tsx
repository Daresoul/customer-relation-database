import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('../../DevTools', () => ({ DevToolsDrawer: () => null }));

const integrations = {
  current: [
    { id: 1, name: 'PointCare', deviceType: 'mnchip_pointcare_chemistry', connectionType: 'serial_port', serialPortName: 'COM3', enabled: true },
    { id: 2, name: 'Exigo', deviceType: 'exigo_eos_vet', connectionType: 'file_watch', watchDirectory: '/lab', filePattern: '*.xml', enabled: true },
    { id: 3, name: 'Spare', deviceType: 'healvet_hv_fia3000', connectionType: 'serial_port', serialPortName: 'COM4', enabled: false },
  ] as unknown[],
};

vi.mock('../../../hooks/useDeviceIntegrations', () => ({
  useDeviceIntegrations: () => ({ data: integrations.current, isLoading: false }),
  useDeviceConnectionStatus: () => ({
    getStatus: (id: number) =>
      id === 1
        ? { integration_id: 1, port_name: 'COM3', device_type: 'mnchip_pointcare_chemistry', status: 'Error', error_kind: 'port_missing', retry_count: 2 }
        : undefined,
    refetch: vi.fn(),
  }),
  useFileWatcherStatus: () => ({
    getStatus: (id: number) =>
      id === 2 ? { integration_id: 2, name: 'Exigo', watch_directory: '/lab', status: 'Watching', files_processed: 0 } : undefined,
  }),
}));

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) =>
    cmd === 'get_device_details' ? { bytesLastMinute: 0, errorsToday: 0, lastRaw: null, log: [] } : ['COM3'],
  );
});
afterEach(cleanup);

function renderIn(node: React.ReactNode, path = '/patients/1') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App>{node}</App>
    </MemoryRouter>,
  );
}

describe('lab machines chip in the header', () => {
  it('rolls up to the worst state and counts the machines that are down', async () => {
    // The port has been failing for two minutes, past the one-minute grace.
    const { serialDownSince } = await import('../deviceHealth');
    serialDownSince(
      { integration_id: 1, port_name: 'COM3', device_type: 'mnchip_pointcare_chemistry', status: 'Error', retry_count: 2 },
      Date.now() - 120_000,
    );
    const { DeviceHealthChip } = await import('../DeviceHealthChip');
    renderIn(<DeviceHealthChip />);
    const chip = screen.getByRole('button', { name: /chip.label/ });
    expect(chip).toHaveAttribute('data-level', 'down');
    expect(chip.textContent).toContain('· 1');
  });

  it('opens the details drawer on the machine that is down', async () => {
    const { DeviceHealthChip } = await import('../DeviceHealthChip');
    renderIn(<DeviceHealthChip />);
    fireEvent.click(screen.getByRole('button', { name: /chip.label/ }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('get_device_details', { integrationId: 1 }));
    expect(await screen.findByText('health.kinds.port_missing.title {"port":"COM3"}')).toBeInTheDocument();
  });

  it('shows nothing when no lab machine is set up', async () => {
    integrations.current = [];
    const { DeviceHealthChip } = await import('../DeviceHealthChip');
    renderIn(<DeviceHealthChip />);
    expect(screen.queryByRole('button', { name: /chip.label/ })).not.toBeInTheDocument();
    integrations.current = [
      { id: 1, name: 'PointCare', deviceType: 'mnchip_pointcare_chemistry', connectionType: 'serial_port', serialPortName: 'COM3', enabled: true },
      { id: 2, name: 'Exigo', deviceType: 'exigo_eos_vet', connectionType: 'file_watch', watchDirectory: '/lab', filePattern: '*.xml', enabled: true },
    ];
  });
});

// app-shell #11: the state was a colour only.
describe('lab machines chip, accessible', () => {
  it('says the state in a word, not only by colour', async () => {
    const { DeviceHealthChip } = await import('../DeviceHealthChip');
    renderIn(<DeviceHealthChip />);
    const chip = screen.getByRole('button', { name: /chip.label/ });
    expect(chip).toHaveAccessibleName(expect.stringMatching(/chip.state.(down|waiting|working)/));
    expect(chip.textContent).toMatch(/chip.state./);
  });
});
