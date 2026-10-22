import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const updateSettings = vi.fn();
vi.mock('../../../hooks/useAppSettings', () => ({
  useAppSettings: () => ({
    settings: { language: 'en', theme: 'light', dateFormat: 'DD/MM/YYYY', currencyId: 1 },
    updateSettings,
    isLoading: false,
    isUpdating: false,
  }),
}));

const setThemeMode = vi.fn();
vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ themeMode: 'light', setThemeMode }),
}));

vi.mock('../../../components/DeviceStatusBar', () => ({ DeviceStatusInline: () => null }));
vi.mock('../components/GeneralSettings', () => ({ default: () => <div>general</div> }));
vi.mock('../components/BusinessSettings', () => ({ default: () => null }));
vi.mock('../components/AppointmentsSettings', () => ({ default: () => null }));
vi.mock('../components/RoomsSettings', () => ({ default: () => null }));
vi.mock('../components/SpeciesSettings', () => ({ default: () => null }));
vi.mock('../components/DeviceInputSettings', () => ({ default: () => null }));
vi.mock('../components/DeviceFilesSettings', () => ({ default: () => null }));
vi.mock('../components/RecordTemplatesSettings', () => ({ default: () => null }));
vi.mock('../components/LineItemsSettings', () => ({ default: () => null }));
vi.mock('../components/DiagnosesSettings', () => ({ default: () => null }));
vi.mock('../components/BackupSettings', () => ({ default: () => null }));
vi.mock('../components/ManagedScannersSettings', () => ({ default: () => null }));
vi.mock('../UpdateSettings', () => ({ UpdateSettings: () => null }));

import SettingsLayout from '../SettingsLayout';

function renderLayout() {
  return render(
    <MemoryRouter>
      <App>
        <SettingsLayout />
      </App>
    </MemoryRouter>,
  );
}

describe('SettingsLayout save', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('shows no success, no second error and keeps the theme when the save fails', async () => {
    updateSettings.mockRejectedValue(new Error('database is locked'));
    renderLayout();

    fireEvent.click(screen.getByText('common:saveChanges'));

    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(document.body.textContent).not.toContain('common:saveSuccess');
    // the hook's mutation already reports the failure
    expect(document.body.textContent).not.toContain('common:operationFailed');
    expect(setThemeMode).not.toHaveBeenCalled();
  });

  it('shows one success after the backend confirms', async () => {
    updateSettings.mockResolvedValue({ settings: {} });
    renderLayout();

    fireEvent.click(screen.getByText('common:saveChanges'));

    await waitFor(() => expect(document.body.textContent).toContain('common:saveSuccess'));
    expect(document.body.textContent?.split('common:saveSuccess').length).toBe(2);
  });
});
