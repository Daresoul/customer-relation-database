import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

let dashboardThrows = false;
vi.mock('../../pages/MainDashboard', () => ({
  MainDashboard: () => {
    if (dashboardThrows) throw new Error('boom');
    return <div>dashboard page</div>;
  },
}));
vi.mock('../../pages/HouseholdDetail', () => ({ HouseholdDetail: () => <div>household page</div> }));
vi.mock('../../pages/PatientDetail', () => ({ PatientDetail: () => <div>patient page</div> }));
vi.mock('../../pages/MedicalRecordDetail', () => ({ MedicalRecordDetailPage: () => <div>record page</div> }));
vi.mock('../../pages/Settings', () => ({ default: () => <div>settings page</div> }));
vi.mock('../../pages/Appointments/Appointments', () => ({ default: () => <div>appointments page</div> }));
vi.mock('../../components/DeviceImportModal/DeviceImportModal', () => ({ default: () => <div>lab import modal</div> }));
vi.mock('../../components/AppWrapper', () => ({
  AppWrapper: ({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {header}
      {children}
    </div>
  ),
}));
vi.mock('../../components/AppHeader', () => ({
  AppShellHeader: () => (
    <div>
      app header <Link to="/settings">header settings</Link>
    </div>
  ),
  GlobalSearchProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../WakeFromTrayHandler', () => ({ WakeFromTrayHandler: () => null }));
vi.mock('../ChipScanHandler', () => ({ ChipScanHandler: () => null }));

import i18n from '../../i18n';
import { appRoutes } from '../routes';

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <App>
      <RouterProvider router={router} />
    </App>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  dashboardThrows = false;
});

describe('app routes (data router)', () => {
  it.each([
    ['/', 'dashboard page'],
    ['/households/4', 'household page'],
    ['/patients/5', 'patient page'],
    ['/medical-records/6', 'record page'],
    ['/appointments', 'appointments page'],
    ['/settings', 'settings page'],
  ])('%s shows its page inside the shell, with the header and the lab import modal', async (path, page) => {
    renderAt(path);
    expect(await screen.findByText(page)).toBeInTheDocument();
    expect(screen.getByText(/app header/)).toBeInTheDocument();
    expect(screen.getByText('lab import modal')).toBeInTheDocument();
  });

  it('a crashing page keeps the header, and leaving the page recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dashboardThrows = true;
    renderAt('/');

    expect(await screen.findByText(i18n.t('common:crash.title'))).toBeInTheDocument();
    expect(screen.getByText(/app header/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('header settings'));
    expect(await screen.findByText('settings page')).toBeInTheDocument();
  });
});
