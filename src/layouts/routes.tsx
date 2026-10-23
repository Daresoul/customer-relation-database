import type { RouteObject } from 'react-router-dom';
import { MainDashboard } from '../pages/MainDashboard';
import { HouseholdDetail } from '../pages/HouseholdDetail';
import { PatientDetail } from '../pages/PatientDetail';
import { MedicalRecordDetailPage } from '../pages/MedicalRecordDetail';
import Settings from '../pages/Settings';
import Appointments from '../pages/Appointments/Appointments';
import { RootLayout } from './RootLayout';
import LabInboxPage from '../pages/LabInbox';

/** The route tree for `createBrowserRouter` (a data router, so `useBlocker` works). */
export const appRoutes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <MainDashboard /> },
      { path: '/households/:id', element: <HouseholdDetail /> },
      { path: '/patients/:id', element: <PatientDetail /> },
      { path: '/medical-records/:id', element: <MedicalRecordDetailPage /> },
      { path: '/appointments', element: <Appointments /> },
      { path: '/settings', element: <Settings /> },
      { path: '/lab-inbox', element: <LabInboxPage /> },
    ],
  },
];
