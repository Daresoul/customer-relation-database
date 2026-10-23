import type { RouteObject } from 'react-router-dom';
import { MainDashboard } from '../pages/MainDashboard';
import { HouseholdDetail } from '../pages/HouseholdDetail';
import { PatientDetail } from '../pages/PatientDetail';
import { MedicalRecordDetailPage } from '../pages/MedicalRecordDetail';
import Settings from '../pages/Settings';
import { RootLayout } from './RootLayout';
import LabInboxPage from '../pages/LabInbox';

/** The route tree for `createBrowserRouter` (a data router, so `useBlocker` works). */
export const appRoutes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <MainDashboard />, handle: { titleKey: 'shell:pageTitle.dashboard' } },
      { path: '/households/:id', element: <HouseholdDetail />, handle: { titleKey: 'shell:pageTitle.household' } },
      { path: '/patients/:id', element: <PatientDetail />, handle: { titleKey: 'shell:pageTitle.patient' } },
      { path: '/medical-records/:id', element: <MedicalRecordDetailPage />, handle: { titleKey: 'shell:pageTitle.record' } },
      { path: '/settings', element: <Settings />, handle: { titleKey: 'shell:pageTitle.settings' } },
      { path: '/lab-inbox', element: <LabInboxPage />, handle: { titleKey: 'shell:pageTitle.labInbox' } },
    ],
  },
];
