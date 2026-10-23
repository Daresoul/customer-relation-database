import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

const today = new Date();
const at = (h: number, m: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).toISOString();

vi.mock('../../../hooks/useDeviceIntegrations', () => ({
  useDeviceIntegrations: () => ({
    data: [
      { id: 1, name: 'PointCare', deviceType: 'mnchip_pointcare_chemistry', connectionType: 'serial_port', serialPortName: 'COM3', enabled: true },
      { id: 2, name: 'Exigo', deviceType: 'exigo_eos_vet', connectionType: 'file_watch', watchDirectory: '/lab', filePattern: '*.xml', enabled: true },
    ],
    isLoading: false,
  }),
  useDeviceConnectionStatus: () => ({
    getStatus: (id: number) =>
      id === 1
        ? {
            integration_id: 1,
            port_name: 'COM3',
            device_type: 'mnchip_pointcare_chemistry',
            status: 'Error',
            error_kind: 'port_missing',
            last_error: 'Failed to open port: not found',
            retry_count: 3,
            last_result_at: at(8, 55),
            last_byte_at: at(8, 56),
          }
        : undefined,
    refetch: vi.fn(),
  }),
  useFileWatcherStatus: () => ({
    getStatus: (id: number) =>
      id === 2
        ? { integration_id: 2, name: 'Exigo', watch_directory: '/lab', status: 'Watching', files_processed: 0, last_result_at: null }
        : undefined,
  }),
}));

const details = {
  bytesLastMinute: 150,
  errorsToday: 2,
  downSince: at(8, 57),
  outagesToday: 2,
  downMinutesToday: 35,
  lastRaw: { at: at(8, 55), byteCount: 14, text: 'MSH|1\nPID|Max\n', hex: '4D 53 48 7C 31 0D', truncated: false },
  log: [
    { at: at(9, 12), label: 'Error', errorKind: 'port_missing', isError: true },
    { at: at(10, 31), label: 'cut_off', errorKind: null, isError: true },
  ],
};

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_device_details') return details;
    if (cmd === 'get_results_today') return { 1: 4, 2: 7 };
    if (cmd === 'get_device_diagnostics') return 'Arkivet diagnostics\nDevice: PointCare';
    return undefined;
  });
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(cleanup);

async function renderDrawer(integrationId = 1) {
  const { DeviceDetailsDrawer } = await import('../DeviceDetailsDrawer');
  render(
    <MemoryRouter>
      <App>
        <DeviceDetailsDrawer open integrationId={integrationId} onClose={() => {}} />
      </App>
    </MemoryRouter>,
  );
}

describe('device details drawer', () => {
  // Machine status #1: tabs hid which machine was broken and cut the names off.
  it('lists every machine with its state in words, last result and results today', async () => {
    await renderDrawer();
    const pointcare = await screen.findByRole('button', { name: /PointCare/ });
    // It failed less than a minute ago, so it still waits (see serialLevel).
    expect(pointcare).toHaveTextContent('chip.state.waiting');
    expect(pointcare).toHaveTextContent('health.lastResult {"time":"08:55"}');
    expect(await within(pointcare).findByText('drawer.resultsToday {"count":4}')).toBeInTheDocument();
    expect(pointcare).toHaveAttribute('aria-pressed', 'true');

    const exigo = screen.getByRole('button', { name: /Exigo/ });
    expect(exigo).toHaveTextContent('chip.state.working');
    expect(exigo).toHaveTextContent('drawer.resultsToday {"count":7}');
    fireEvent.click(exigo);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('get_device_details', { integrationId: 2 }));
    expect(exigo).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the state in plain words, what to do, and the times', async () => {
    await renderDrawer();
    expect(await screen.findByText('health.kinds.port_missing.title {"port":"COM3"}')).toBeInTheDocument();
    expect(screen.getByText('health.kinds.port_missing.action {"port":"COM3"}')).toBeInTheDocument();
    expect(screen.getByText('health.lastResult {"time":"08:55"}')).toBeInTheDocument();
    expect(screen.getByText('drawer.lastData {"time":"08:56"}')).toBeInTheDocument();
  });

  it('shows the error count, the live byte counter and the last raw message with a hex view', async () => {
    await renderDrawer();
    // Machine status #5: today in minutes and breaks; since when, and how often it tried.
    expect(await screen.findByText('drawer.today.down {"time":"35 drawer.minutes","count":2}')).toBeInTheDocument();
    expect(screen.getByText('drawer.downSince {"time":"08:57"} · drawer.attempts {"count":3}')).toBeInTheDocument();
    expect(screen.getByText('drawer.bytesLastMinute {"count":150}')).toBeInTheDocument();
    expect(screen.getByTestId('device-raw-message').textContent).toBe('MSH|1\nPID|Max\n');
    fireEvent.click(screen.getByRole('switch', { name: 'drawer.showHex' }));
    expect(screen.getByTestId('device-raw-message').textContent).toBe('4D 53 48 7C 31 0D');
    expect(invokeMock).toHaveBeenCalledWith('get_device_details', { integrationId: 1 });
  });

  it('copies the diagnostics text', async () => {
    await renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: /drawer.copyDiagnostics/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Arkivet diagnostics\nDevice: PointCare'));
    expect(invokeMock).toHaveBeenCalledWith('get_device_diagnostics', { integrationId: 1 });
  });

  it('reconnects and opens the log folder', async () => {
    await renderDrawer();
    fireEvent.click(await screen.findByRole('button', { name: /drawer.reconnect/ }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('reconnect_device_listeners'));
    fireEvent.click(screen.getByRole('button', { name: /drawer.openLogFolder/ }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('open_device_log_folder'));
  });

  it('a folder device shows its folder and no byte counter', async () => {
    await renderDrawer(2);
    expect(await screen.findByText('status.watching')).toBeInTheDocument();
    expect(screen.getByText('tooltips.directory {"directory":"/lab"}')).toBeInTheDocument();
    expect(screen.queryByText(/drawer.bytesLastMinute/)).not.toBeInTheDocument();
  });
});
