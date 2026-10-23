import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App, Form } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import GeneralSettings from '../components/GeneralSettings';

function renderSettings() {
  return render(
    <App>
      <Form>
        <GeneralSettings isUpdating={false} />
      </Form>
    </App>,
  );
}

// settings.md #7e: a failed switch was ignored, so the box showed a state
// the computer didn't have.
describe('launch at login switch', () => {
  afterEach(() => {
    cleanup();
    invokeMock.mockReset();
    localStorage.clear();
  });

  it('flips back and says so when the change fails', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'plugin:autostart|is_enabled') return true;
      throw new Error('access denied');
    });
    renderSettings();
    const box = await screen.findByRole('switch', { name: 'settings:general.launchAtLogin' });
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(box);

    expect(await screen.findByText('settings:general.launchAtLoginFailed')).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'true'));
  });

  it('a successful change is kept and remembered as the user choice', async () => {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'plugin:autostart|is_enabled' ? true : null));
    renderSettings();
    const box = await screen.findByRole('switch', { name: 'settings:general.launchAtLogin' });
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(box);

    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'false'));
    expect(invokeMock).toHaveBeenCalledWith('plugin:autostart|disable');
    expect(localStorage.getItem('arkivet.autostartDefaultApplied')).toBe('1');
  });
});
