import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));

vi.mock('@tauri-apps/api', () => ({ invoke: vi.fn(async () => []) }));
vi.mock('@tauri-apps/api/dialog', () => ({ open: vi.fn() }));
vi.mock('../components/DeviceAlertSettings', () => ({ DeviceAlertSettings: () => null }));

const updateMock = vi.fn(async () => ({}));
const mutation = (fn = vi.fn(async () => ({}))) => ({ mutateAsync: fn, isPending: false });

vi.mock('../../../hooks/useDeviceIntegrations', () => ({
  useDeviceIntegrations: () => ({
    data: [
      {
        id: 1, name: 'Healvet', deviceType: 'healvet_hv_fia_3000', connectionType: 'serial_port',
        serialPortName: 'COM3', serialBaudRate: 19200, enabled: true,
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useCreateDeviceIntegration: () => mutation(),
  useUpdateDeviceIntegration: () => mutation(updateMock),
  useDeleteDeviceIntegration: () => mutation(),
  useToggleDeviceIntegration: () => mutation(),
  useDeviceConnectionStatus: () => ({ getStatus: () => undefined }),
}));

afterEach(cleanup);

// serial-pipeline #11: the saved baud rate had no field, so it could not be set or seen.
describe('device form baud rate', () => {
  it('shows the saved baud rate of a serial machine and saves a change', async () => {
    const { default: DeviceInputSettings } = await import('../components/DeviceInputSettings');
    render(
      <App>
        <DeviceInputSettings />
      </App>,
    );
    fireEvent.click(screen.getByRole('button', { name: /common:edit/ }));

    const baud = await screen.findByLabelText('form.labels.baudRate');
    expect(baud).toHaveValue('19200');

    fireEvent.change(baud, { target: { value: '9600' } });
    fireEvent.click(screen.getByRole('button', { name: /common:save|OK/i }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls[0][0]).toMatchObject({ id: 1, data: { serialBaudRate: 9600 } });
  });
});
