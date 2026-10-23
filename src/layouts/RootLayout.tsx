import { Outlet } from 'react-router-dom';
import { AppWrapper } from '../components/AppWrapper';
import { RouteErrorBoundary } from '../components/common/ErrorBoundary';
import DeviceImportModal from '../components/DeviceImportModal/DeviceImportModal';
import { AppShellHeader, GlobalSearchProvider } from '../components/AppHeader';
import { DeviceHealthChip } from '../components/DeviceStatusBar';
import { DevSimulatorButton } from '../components/DeviceStatusBar/DevSimulatorButton';
import LabInboxBadge from '../components/LabInbox/LabInboxBadge';
import { WakeFromTrayHandler } from './WakeFromTrayHandler';
import { ChipScanHandler } from './ChipScanHandler';

/** Every page renders inside this: header (lab machines chip, lab inbox badge), lab import, crash boundary. */
export function RootLayout() {
  return (
    <GlobalSearchProvider>
      <WakeFromTrayHandler />
      <ChipScanHandler />
      <DeviceImportModal />
      <AppWrapper
        header={
          <AppShellHeader
            labInboxSlot={<LabInboxBadge />}
            deviceStatusSlot={
              <>
                <DeviceHealthChip />
                <DevSimulatorButton />
              </>
            }
          />
        }
      >
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </AppWrapper>
    </GlobalSearchProvider>
  );
}
