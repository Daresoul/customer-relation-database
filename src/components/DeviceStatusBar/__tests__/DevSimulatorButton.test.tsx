import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../DevTools', () => ({
  DevToolsDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="devtools-drawer" /> : null),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

async function renderButton() {
  vi.resetModules();
  const { DevSimulatorButton } = await import('../DevSimulatorButton');
  return render(
    <App>
      <DevSimulatorButton />
    </App>,
  );
}

// device-health #6: the simulator lived on the old dashboard device bar.
describe('device simulator button', () => {
  it('is never offered in a production build', async () => {
    vi.stubEnv('DEV', false);
    await renderButton();
    expect(screen.queryByRole('button', { name: /DEV/ })).toBeNull();
  });

  it('opens the simulator in a dev build', async () => {
    vi.stubEnv('DEV', true);
    await renderButton();
    fireEvent.click(screen.getByRole('button', { name: /DEV/ }));
    expect(await screen.findByTestId('devtools-drawer')).toBeInTheDocument();
  });
});
