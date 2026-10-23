import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { useViewContext } from '../contexts';

/**
 * The tray brings the window back: a new lab file and a manual wake go to the
 * dashboard (the result opens the import itself when it arrives). A wake by
 * chip scan is left to the chip-scan handler, which opens the patient.
 */
export function WakeFromTrayHandler() {
  const { setCurrentView } = useViewContext();
  const navigate = useNavigate();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<{ cause?: string }>('wake-from-tray', (event) => {
      const cause = event.payload?.cause;
      if (cause === 'file' || cause === 'manual') {
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
  }, [setCurrentView, navigate]);

  return null;
}
