import { Outlet } from 'react-router-dom';
import { AppWrapper } from '../components/AppWrapper';
import { RouteErrorBoundary } from '../components/common/ErrorBoundary';
import DeviceImportModal from '../components/DeviceImportModal/DeviceImportModal';
import { AppShellHeader, GlobalSearchProvider } from '../components/AppHeader';
import { WakeFromTrayHandler } from './WakeFromTrayHandler';
import { ChipScanHandler } from './ChipScanHandler';

/** Every page renders inside this: header, device bar, lab import, crash boundary. */
export function RootLayout() {
  return (
    <GlobalSearchProvider>
      <WakeFromTrayHandler />
      <ChipScanHandler />
      <DeviceImportModal />
      <AppWrapper header={<AppShellHeader />}>
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </AppWrapper>
    </GlobalSearchProvider>
  );
}
