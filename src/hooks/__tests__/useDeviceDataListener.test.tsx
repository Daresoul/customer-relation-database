import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => unknown>(),
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => unknown) => {
    mocks.handlers.set(name, handler);
    return () => mocks.handlers.delete(name);
  }),
}));

vi.mock('@tauri-apps/api', () => ({ invoke: mocks.invoke }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { DeviceImportProvider, useDeviceImport } from '../../contexts/DeviceImportContext';
import { useDeviceDataListener } from '../useDeviceDataListener';

let ctx: ReturnType<typeof useDeviceImport>;

function Probe() {
  useDeviceDataListener();
  ctx = useDeviceImport();
  return null;
}

function renderListener() {
  return render(
    <DeviceImportProvider>
      <AntApp>
        <Probe />
      </AntApp>
    </DeviceImportProvider>,
  );
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    deviceType: 'exigo_eos_vet',
    deviceName: 'Exigo',
    connectionMethod: 'file_watch',
    testResults: { WBC: '12.1' },
    originalFileName: 'exigo.xml',
    fileData: [1, 2, 3],
    mimeType: 'application/xml',
    detectedAt: '2026-10-23T10:00:00Z',
    ...overrides,
  };
}

async function emit(data: Record<string, unknown>) {
  await waitFor(() => expect(mocks.handlers.has('device-data-received')).toBe(true));
  await act(async () => {
    await mocks.handlers.get('device-data-received')!({ payload: data });
  });
}

function chipMatch(id: number, name: string) {
  return { patient: { id, name }, method: 'microchip', ambiguous: false, candidateCount: 1 };
}

describe('useDeviceDataListener — one result per import', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.invoke.mockReset();
  });

  it('a second result waits instead of joining the open import', async () => {
    mocks.invoke
      .mockResolvedValueOnce(chipMatch(1, 'Max'))
      .mockResolvedValueOnce(chipMatch(2, 'Bella'));
    renderListener();

    await emit(payload({ patientIdentifier: '807010000000001', originalFileName: 'max.xml' }));
    await emit(payload({ patientIdentifier: '807010000000002', originalFileName: 'bella.xml', fileData: [9] }));

    expect(ctx.modalOpen).toBe(true);
    expect(ctx.suggestedPatientId).toBe(1);
    expect(ctx.pendingFiles.map((f) => f.fileName)).toEqual(['max.xml']);
    expect(ctx.waitingCount).toBe(1);
  });

  it('the waiting result opens with its own patient once the current one is finished', async () => {
    mocks.invoke
      .mockResolvedValueOnce(chipMatch(1, 'Max'))
      .mockResolvedValueOnce(chipMatch(2, 'Bella'));
    renderListener();
    await emit(payload({ patientIdentifier: '807010000000001', originalFileName: 'max.xml' }));
    await emit(payload({ patientIdentifier: '807010000000002', originalFileName: 'bella.xml', fileData: [9] }));
    const firstImport = ctx.importId;

    act(() => ctx.finishImport());

    expect(ctx.modalOpen).toBe(true);
    expect(ctx.pendingFiles.map((f) => f.fileName)).toEqual(['bella.xml']);
    expect(ctx.suggestedPatientId).toBe(2);
    expect(ctx.waitingCount).toBe(0);
    expect(ctx.importId).not.toBe(firstImport);

    act(() => ctx.finishImport());

    expect(ctx.modalOpen).toBe(false);
    expect(ctx.pendingFiles).toHaveLength(0);
    expect(ctx.suggestedPatientId).toBeUndefined();
  });

  it('keeps how the patient was matched on the file', async () => {
    mocks.invoke.mockResolvedValueOnce({ patient: null, method: 'microchip', ambiguous: true, candidateCount: 2 });
    renderListener();

    await emit(payload({ patientIdentifier: '807010000000001' }));

    expect(ctx.pendingFiles[0].matchMethod).toBe('microchip');
    expect(ctx.pendingFiles[0].matchAmbiguous).toBe(true);
    expect(ctx.suggestedPatientId).toBeUndefined();
  });

  it('passes the saved file id on as the source file id', async () => {
    renderListener();

    await emit(payload({ fileId: 42 }));

    expect(ctx.pendingFiles[0].sourceFileId).toBe('42');
  });

  it('works without a file id', async () => {
    renderListener();

    await emit(payload());

    expect(ctx.pendingFiles).toHaveLength(1);
    expect(ctx.pendingFiles[0].sourceFileId).toBeUndefined();
  });

  it('still tells the user a result arrived when the patient lookup fails', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('database is locked'));
    renderListener();

    await emit(payload({ patientIdentifier: 'MAX' }));

    expect(ctx.pendingFiles).toHaveLength(1);
    expect(await screen.findByText('medical:deviceImport.lookupFailed')).toBeInTheDocument();
  });
});
