import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
vi.mock('../components/ClinicSettings', () => ({ default: () => <div>clinic section</div> }));
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

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <App>
        <SettingsLayout />
        <LocationProbe />
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

  it('opens the clinic profile from a link', () => {
    renderAt('/settings?section=clinic');
    expect(screen.getByText('clinic section')).toBeInTheDocument();
  });

  it('puts the section picked in the menu into the URL, so Back and links return to it', () => {
    renderAt('/settings');
    fireEvent.click(screen.getByText('settings:sections.backups'));
    expect(screen.getByText('backup section')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('?section=backups');
  });
});
