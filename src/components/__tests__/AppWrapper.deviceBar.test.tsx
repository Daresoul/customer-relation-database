import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tauri-apps/api', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ themeMode: 'light' }) }));
vi.mock('../../hooks/useUpdater', () => ({ useUpdater: () => ({ checkForUpdates: vi.fn() }) }));
vi.mock('../../services/updateService', () => ({
  updateService: { getPreferences: vi.fn().mockResolvedValue({ autoCheckEnabled: false }) },
}));
vi.mock('../../hooks/useDeviceIntegrations', () => ({
  useDeviceIntegrations: () => ({
    data: [{ id: 1, name: 'PointCare', deviceType: 'mnchip_pointcare_chemistry', connectionType: 'serial_port', serialPortName: 'COM3', enabled: true }],
    isLoading: false,
  }),
  useDeviceConnectionStatus: () => ({ getStatus: () => undefined, refetch: vi.fn() }),
  useFileWatcherStatus: () => ({ getStatus: () => undefined }),
}));

afterEach(cleanup);

// device-health #6: the header chip replaced the dashboard device bar, which
// was still mounted under it.
describe('app shell', () => {
  it('shows the header and the page, and no second device bar', async () => {
    const { AppWrapper } = await import('../AppWrapper');
    render(
      <MemoryRouter initialEntries={['/']}>
        <App>
          <AppWrapper header={<div>app header</div>}>
            <div>dashboard page</div>
          </AppWrapper>
        </App>
      </MemoryRouter>,
    );
    expect(screen.getByText('app header')).toBeInTheDocument();
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('PointCare')).not.toBeInTheDocument();
    expect(screen.queryByText('labels.devices')).not.toBeInTheDocument();
  });
});
