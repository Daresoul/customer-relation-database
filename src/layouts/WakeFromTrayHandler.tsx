import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { useDeviceImport } from '../contexts/useDeviceImport';
import { useViewContext } from '../contexts';

/**
 * The tray brings the window back: a new lab file opens the import and the
 * dashboard; a manual wake resets to the dashboard. A wake by chip scan is
 * left to the chip-scan handler, which opens the patient.
 */
export function WakeFromTrayHandler() {
  const { openModal } = useDeviceImport();
  const { setCurrentView } = useViewContext();
  const navigate = useNavigate();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<{ cause?: string }>('wake-from-tray', (event) => {
      const cause = event.payload?.cause;
      if (cause === 'file') {
        openModal();
        setCurrentView('animal');
        navigate('/');
      } else if (cause === 'manual') {
        setCurrentView('animal');
        navigate('/');
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [openModal, setCurrentView, navigate]);

  return null;
}
