/**
 * Saves must refresh every other page that shows the same data, not wait
 * for the 5-minute staleTime. Each test checks one write path against the
 * cached readers it affects.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tauri-apps/api', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), listen: vi.fn().mockResolvedValue(() => {}) }));

const patientService = vi.hoisted(() => ({
  createPatient: vi.fn(),
  updatePatient: vi.fn(),
  deletePatient: vi.fn(),
  updatePatientHousehold: vi.fn(),
}));
vi.mock('../../services/patientService', () => ({ PatientService: patientService }));

vi.mock('../../components/forms/PatientFormWithOwner', () => ({
  default: ({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) => (
    <button onClick={() => onSubmit({ name: 'Bella' }).catch(() => {})}>stub-submit</button>
  ),
}));

import { useUpdateHousehold, useAddPerson, useDeletePerson, useUpdatePerson, useUpdatePersonContacts } from '../useHousehold';
import { useUpdatePatient, useDeletePatient } from '../usePatient';
import { AnimalsSection } from '../../pages/HouseholdDetail/AnimalsSection';
import { CreateHouseholdInline } from '../../components/forms/CreateHouseholdInline';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>{children}</App>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const roots = () => spy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] } | undefined)?.queryKey?.[0]);
  const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] } | undefined)?.queryKey);
  return { client, wrapper, roots, keys };
}

describe('invalidation after saves', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('adding a pet on the household page refreshes its pets list and the patient pickers', async () => {
    patientService.createPatient.mockResolvedValue({ id: 30, name: 'Bella' });
    const { wrapper, roots } = setup();
    render(<AnimalsSection patients={[]} householdId={12} />, { wrapper });

    fireEvent.click(screen.getAllByText('detail.animals.registerNewPet')[0]);
    fireEvent.click(await screen.findByText('stub-submit'));

    await waitFor(() => expect(roots()).toContain('household-patients'));
    expect(roots()).toContain('patients');
  });

  it('editing a patient refreshes the household pets list under its real key', async () => {
    patientService.updatePatient.mockResolvedValue({ id: 3, name: 'Rex', householdId: 12 });
    const { wrapper, roots } = setup();
    const { result } = renderHook(() => useUpdatePatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ patientId: 3, updates: { name: 'Rex' } });
    });

    expect(roots()).toContain('household-patients');
  });

  // Lab ranges and flags follow the species; a species fix re-reads them.
  it('editing a patient refreshes its lab values', async () => {
    patientService.updatePatient.mockResolvedValue({ id: 3, name: 'Rex', householdId: 12, speciesId: 2 });
    const { wrapper, roots } = setup();
    const { result } = renderHook(() => useUpdatePatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ patientId: 3, updates: { speciesId: 2 } });
    });

    expect(roots()).toContain('patient-labs');
    expect(roots()).toContain('record-labs');
  });

  it('deleting a patient refreshes the household pets list and the calendar', async () => {
    patientService.deletePatient.mockResolvedValue(undefined);
    const { wrapper, roots } = setup();
    const { result } = renderHook(() => useDeletePatient(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(3);
    });

    expect(roots()).toContain('household-patients');
    expect(roots()).toContain('appointments');
  });

  it('editing a household refreshes the owner block on its pets and the household pickers', async () => {
    invokeMock.mockResolvedValue(null);
    const { wrapper, roots } = setup();
    const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ householdId: 12, updates: { address: 'Ulica 2' } });
    });

    expect(roots()).toContain('patient');
    expect(roots()).toContain('all-households');
  });

  it.each([
    ['add person', () => useAddPerson(), { householdId: 12, person: {} }],
    ['update person', () => useUpdatePerson(), { personId: 1, householdId: 12, updates: {} }],
    ['delete person', () => useDeletePerson(), { personId: 1, householdId: 12 }],
    ['update contacts', () => useUpdatePersonContacts(), { personId: 1, householdId: 12, contacts: [] }],
  ])('%s refreshes the owner block on the pet pages', async (_name, hook, vars) => {
    invokeMock.mockResolvedValue(null);
    const { wrapper, roots } = setup();
    const { result } = renderHook(hook as () => { mutateAsync: (v: unknown) => Promise<unknown> }, { wrapper });

    await act(async () => {
      await result.current.mutateAsync(vars);
    });

    expect(roots()).toContain('patient');
  });

  it('creating a household inline refreshes the household pickers', async () => {
    invokeMock.mockResolvedValue({ id: 40, householdName: 'Petrovski' });
    const { wrapper, roots } = setup();
    render(<CreateHouseholdInline onCreated={vi.fn()} onCancel={vi.fn()} submitLabel="stub-create" />, { wrapper });

    fireEvent.change(screen.getAllByPlaceholderText('forms:placeholders.enterName')[0], { target: { value: 'Petrovski' } });
    fireEvent.click(screen.getByText('stub-create'));

    await waitFor(() => expect(roots()).toContain('all-households'));
    expect(roots()).toContain('household');
  });

  // frontend-data #6: no query uses these keys, so naming them hid which
  // lists really refresh.
  it('names only cache keys that a query uses', async () => {
    invokeMock.mockResolvedValue(null);
    const { wrapper, roots } = setup();
    const { result } = renderHook(() => useUpdateHousehold(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ householdId: 12, updates: { address: 'Ulica 2' } });
    });

    for (const dead of ['households', 'household-search', 'household-quick-search']) {
      expect(roots()).not.toContain(dead);
    }
  });
});
