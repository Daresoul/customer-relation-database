import type React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, Modal } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

let keyboardScan: ((code: string) => void) | undefined;
vi.mock('@/hooks/useBarcodeScanner', () => ({
  useBarcodeScanner: ({ onScan }: { onScan: (code: string) => void }) => {
    keyboardScan = onScan;
  },
}));

const tauriListeners = new Map<string, (event: { payload: unknown }) => void>();
vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, cb: (event: { payload: unknown }) => void) => {
    tauriListeners.set(name, cb);
    return Promise.resolve(() => tauriListeners.delete(name));
  },
}));

let labImportOpen = false;
vi.mock('../../contexts/useDeviceImport', () => ({
  useDeviceImport: () => ({ modalOpen: labImportOpen }),
}));

import { ChipScanHandler } from '../ChipScanHandler';
import { GlobalSearchProvider } from '../../components/AppHeader';

const CHIP = '807000000123456';
const hit = (id: number, chip: string | null = CHIP) => ({
  patientId: id,
  patientName: `Pet ${id}`,
  species: 'Dog',
  microchipId: chip,
  isActive: true,
  householdId: 1,
  ownerName: 'Ана Петровска',
  ownerPhone: '070 123 456',
});

function renderShell(extra?: React.ReactNode) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <GlobalSearchProvider>
            <ChipScanHandler />
            <input aria-label="notes field" />
            {extra}
          </GlobalSearchProvider>
        ),
      },
    ],
    { initialEntries: ['/households/1'] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App>
        <RouterProvider router={router} />
      </App>
    </QueryClientProvider>,
  );
  return router;
}

function searchReturns(hits: unknown[]) {
  invokeMock.mockImplementation((cmd: string) => Promise.resolve(cmd === 'global_patient_search' ? hits : null));
}

const scanWithKeyboard = (code = CHIP) =>
  act(() => {
    keyboardScan?.(code);
  });

beforeEach(() => {
  invokeMock.mockReset();
  labImportOpen = false;
  tauriListeners.clear();
  (document.activeElement as HTMLElement | null)?.blur?.();
});
afterEach(cleanup);

describe('chip scan anywhere in the app', () => {
  it('opens the patient when exactly one patient has the chip', async () => {
    searchReturns([hit(11)]);
    const router = renderShell();

    scanWithKeyboard();

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/11'));
    expect(invokeMock).toHaveBeenCalledWith('global_patient_search', { query: CHIP, limit: 20 });
  });

  it('only counts patients whose chip is the scanned one (not an owner phone that contains it)', async () => {
    searchReturns([hit(11), hit(12, null)]);
    const router = renderShell();

    scanWithKeyboard();

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/11'));
  });

  it('opens the search with the chip filled in when several patients have it', async () => {
    searchReturns([hit(11), hit(12)]);
    renderShell();

    scanWithKeyboard();

    expect(await screen.findByDisplayValue(CHIP)).toBeInTheDocument();
  });

  it('offers to create a patient with the chip when nobody has it', async () => {
    searchReturns([]);
    const router = renderShell();

    scanWithKeyboard();
    fireEvent.click(await screen.findByRole('button', { name: 'shell:scan.createPatient' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.state).toEqual({ newPatientChip: CHIP });
  });

  it('does nothing when the offer is declined', async () => {
    searchReturns([]);
    const router = renderShell();

    scanWithKeyboard();
    fireEvent.click(await screen.findByRole('button', { name: 'shell:scan.cancel' }));

    await new Promise((r) => setTimeout(r, 20));
    expect(router.state.location.pathname).toBe('/households/1');
  });

  it('handles a scan from the HID scanner the same way', async () => {
    searchReturns([hit(11)]);
    const router = renderShell();
    await waitFor(() => expect(tauriListeners.has('scanner:barcode')).toBe(true));

    act(() => {
      tauriListeners.get('scanner:barcode')?.({ payload: { code: CHIP } });
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/11'));
  });

  it('handles a scan that woke the app from the tray', async () => {
    searchReturns([hit(11)]);
    const router = renderShell();
    await waitFor(() => expect(tauriListeners.has('wake-from-tray')).toBe(true));

    act(() => {
      tauriListeners.get('wake-from-tray')?.({ payload: { cause: 'scan', code: CHIP } });
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/patients/11'));
  });

  it('acts once when the keyboard wedge and the HID event report the same scan', async () => {
    searchReturns([hit(11)]);
    renderShell();
    await waitFor(() => expect(tauriListeners.has('scanner:barcode')).toBe(true));

    scanWithKeyboard();
    act(() => {
      tauriListeners.get('scanner:barcode')?.({ payload: { code: CHIP } });
    });

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the scan alone while the user is typing in a text field', async () => {
    searchReturns([hit(11)]);
    const router = renderShell();
    screen.getByLabelText('notes field').focus();

    scanWithKeyboard();

    await new Promise((r) => setTimeout(r, 20));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/households/1');
  });

  it('leaves the scan to the lab import while it is open', async () => {
    searchReturns([hit(11)]);
    labImportOpen = true;
    renderShell();

    scanWithKeyboard();

    await new Promise((r) => setTimeout(r, 20));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('does not interrupt another open dialog', async () => {
    searchReturns([hit(11)]);
    renderShell(
      <Modal open title="adding a household">
        form
      </Modal>,
    );

    scanWithKeyboard();

    await new Promise((r) => setTimeout(r, 20));
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
