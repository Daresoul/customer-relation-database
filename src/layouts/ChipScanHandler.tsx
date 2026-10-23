import { useCallback, useEffect, useRef } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useDeviceImport } from '../contexts/useDeviceImport';
import { useGlobalSearch } from '../components/AppHeader';
import { searchPatientsEverywhere } from '../components/AppHeader/usePatientSearch';

const SAME_SCAN_MS = 500;

/** State the dashboard reads to open "Add patient" with the chip filled in. */
export interface NewPatientFromScan {
  newPatientChip: string;
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function dialogOpen(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-wrap')).some((el) => el.style.display !== 'none');
}

const sameChip = (a: string | null, b: string) => (a ?? '').replace(/\s/g, '').toLowerCase() === b.toLowerCase();

/**
 * A microchip scan on any page: one patient with that chip opens their page,
 * several open the search with the chip filled in, none offers "Create
 * patient". A scan while typing in a field (it lands in the field), while the
 * lab import is open (it matches the result) or over another dialog is left
 * alone.
 */
export function ChipScanHandler() {
  const { t } = useTranslation('shell');
  const { modal, notification } = App.useApp();
  const navigate = useNavigate();
  const { openSearch } = useGlobalSearch();
  const { modalOpen: labImportOpen } = useDeviceImport();
  const lastScan = useRef<{ code: string; at: number } | null>(null);

  const handleScan = useCallback(
    async (code: string) => {
      if (labImportOpen || isTyping() || dialogOpen()) return;
      const now = Date.now();
      if (lastScan.current?.code === code && now - lastScan.current.at < SAME_SCAN_MS) return;
      lastScan.current = { code, at: now };

      let matches;
      try {
        matches = (await searchPatientsEverywhere(code)).filter((h) => sameChip(h.microchipId, code));
      } catch {
        notification.error({ message: t('shell:scan.failed') });
        return;
      }
      if (matches.length === 1) {
        navigate(`/patients/${matches[0].patientId}`);
      } else if (matches.length > 1) {
        openSearch(code);
      } else {
        modal.confirm({
          title: t('shell:scan.notFoundTitle'),
          content: t('shell:scan.notFoundBody', { chip: code }),
          okText: t('shell:scan.createPatient'),
          cancelText: t('shell:scan.cancel'),
          onOk: () => navigate('/', { state: { newPatientChip: code } satisfies NewPatientFromScan }),
        });
      }
    },
    [labImportOpen, modal, notification, navigate, openSearch, t],
  );

  useBarcodeScanner({ suffixKey: 'Enter', minLength: 8, interKeyDelay: 50, finalizeTimeout: 100, onScan: handleScan });

  // Tauri listeners register once; the ref always calls the latest handler.
  const handleRef = useRef(handleScan);
  handleRef.current = handleScan;
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let cancelled = false;
    const keep = (fn: () => void) => (cancelled ? fn() : unlisteners.push(fn));
    listen<{ code?: string }>('scanner:barcode', (e) => {
      if (e.payload?.code) handleRef.current(String(e.payload.code));
    }).then(keep);
    listen<{ cause?: string; code?: string }>('wake-from-tray', (e) => {
      if (e.payload?.cause === 'scan' && e.payload.code) handleRef.current(String(e.payload.code));
    }).then(keep);
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  return null;
}
