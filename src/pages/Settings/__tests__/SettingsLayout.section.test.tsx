import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
vi.mock('../components/BackupSettings', () => ({ default: () => <div>backup section</div> }));
vi.mock('../components/ManagedScannersSettings', () => ({ default: () => null }));
vi.mock('../UpdateSettings', () => ({ UpdateSettings: () => null }));

import SettingsLayout from '../SettingsLayout';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <App>
        <SettingsLayout />
      </App>
    </MemoryRouter>,
  );
}

describe('SettingsLayout opening section', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens the section named in the link (the header backup light links to Backups)', () => {
    renderAt('/settings?section=backups');
    expect(screen.getByText('backup section')).toBeInTheDocument();
    expect(screen.queryByText('general')).not.toBeInTheDocument();
  });

  it('opens General without a section, or with an unknown one', () => {
    renderAt('/settings?section=nope');
    expect(screen.getByText('general')).toBeInTheDocument();
  });
});
