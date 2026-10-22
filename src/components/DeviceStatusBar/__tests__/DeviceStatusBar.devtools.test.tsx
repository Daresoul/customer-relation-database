import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('@tauri-apps/api', () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn().mockResolvedValue([]) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../hooks/useDeviceIntegrations', () => ({
  useDeviceIntegrations: () => ({
    data: [
      {
        id: 1,
        name: 'PointCare',
        deviceType: 'mnchip_pointcare',
        connectionType: 'serial_port',
        serialPortName: 'COM3',
        enabled: true,
      },
    ],
    isLoading: false,
  }),
  useDeviceConnectionStatus: () => ({ getStatus: () => undefined, refetch: vi.fn() }),
  useFileWatcherStatus: () => ({ getStatus: () => undefined }),
}));

vi.mock('../../DevTools', () => ({
  DevToolsDrawer: () => <div data-testid="devtools-drawer" />,
}));

const DEV_TOOLS_STORAGE_KEY = 'vet-clinic-dev-tools-enabled';

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

async function renderStatusBar() {
  vi.resetModules();
  const { DeviceStatusBar } = await import('../DeviceStatusBar');
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App>
        <DeviceStatusBar />
      </App>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('DeviceStatusBar dev tools', () => {
  it('never offers the device simulator in a production build', async () => {
    vi.stubEnv('DEV', false);
    stubLocalStorage({ [DEV_TOOLS_STORAGE_KEY]: 'true' });

    const { container } = await renderStatusBar();
    expect(await screen.findByText('PointCare')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true, altKey: true });
    const icon = container.querySelector('.anticon-api');
    for (let i = 0; i < 7; i++) {
      if (icon) fireEvent.click(icon);
    }

    expect(screen.queryByText('DEV')).toBeNull();
    expect(screen.queryByTestId('devtools-drawer')).toBeNull();
  });

  it('shows the device simulator in a dev build', async () => {
    vi.stubEnv('DEV', true);
    stubLocalStorage();

    await renderStatusBar();

    expect(await screen.findByText('DEV')).toBeInTheDocument();
  });
});
