import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const refetch = vi.fn();
vi.mock('../../../hooks/useAppSettings', () => ({
  useAppSettings: () => ({
    settings: undefined,
    error: new Error('database is locked'),
    refetch,
    updateSettings: vi.fn(),
    isLoading: false,
    isUpdating: false,
  }),
}));
vi.mock('../../../contexts/useTheme', () => ({
  useTheme: () => ({ themeMode: 'light', setThemeMode: vi.fn() }),
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

// settings.md #15: a failed load showed made-up defaults, and Save then
// wrote them over the clinic's real settings.
describe('Settings that failed to load', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the error with Retry and offers no Save', () => {
    render(
      <MemoryRouter>
        <App>
          <SettingsLayout />
        </App>
      </MemoryRouter>,
    );

    expect(screen.getByText('settings:loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('common:saveChanges')).not.toBeInTheDocument();
    expect(screen.queryByText('general')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('common:retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
