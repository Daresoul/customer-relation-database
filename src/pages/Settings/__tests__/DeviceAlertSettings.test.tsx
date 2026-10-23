import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

vi.mock('../../../hooks/useDeviceIntegrations', () => ({
  useDeviceIntegrations: () => ({
    data: [
      { id: 1, name: 'PointCare', deviceType: 'mnchip_pointcare_chemistry', connectionType: 'serial_port', serialPortName: 'COM3', enabled: true },
      { id: 2, name: 'Exigo', deviceType: 'exigo_eos_vet', connectionType: 'file_watch', watchDirectory: '/lab', enabled: true },
    ],
    isLoading: false,
  }),
}));

const stored = {
  notifyEnabled: true,
  downAfterMinutes: 10,
  clinicOpen: '07:00',
  clinicClose: '20:00',
  clinicDays: [1, 2, 3, 4, 5, 6],
  quietAlerts: [{ integrationId: 2, afterHours: 3 }],
};

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string, args?: { settings: unknown }) =>
    cmd === 'update_device_alert_settings' ? args?.settings : stored,
  );
});
afterEach(cleanup);

async function renderSettings() {
  const { DeviceAlertSettings } = await import('../components/DeviceAlertSettings');
  render(
    <App>
      <DeviceAlertSettings />
    </App>,
  );
  await screen.findByDisplayValue('10');
}

describe('lab machine notification settings', () => {
  it('shows the stored settings, with the quiet alert per machine', async () => {
    await renderSettings();
    expect(invokeMock).toHaveBeenCalledWith('get_device_alert_settings');
    expect(screen.getByRole('switch', { name: 'alerts.notifyEnabled' })).toBeChecked();
    expect(screen.getByDisplayValue('07:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20:00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'alerts.days.6' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'alerts.days.7' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'alerts.quietFor {"name":"Exigo"}' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'alerts.quietFor {"name":"PointCare"}' })).not.toBeChecked();
    expect(screen.getByDisplayValue('3')).toBeInTheDocument();
  });

  it('saves what was changed', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: 'alerts.quietFor {"name":"PointCare"}' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'alerts.days.7' }));
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /alerts.save/ }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('update_device_alert_settings', {
        settings: {
          ...stored,
          downAfterMinutes: 15,
          clinicDays: [1, 2, 3, 4, 5, 6, 7],
          quietAlerts: [
            { integrationId: 1, afterHours: 4 },
            { integrationId: 2, afterHours: 3 },
          ],
        },
      }),
    );
  });
});
