import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));

const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { PatientInfo } from '../PatientInfo';
import type { PatientDetail } from '../../../types/patient';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>{children}</App>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const rex = (over: Partial<PatientDetail> = {}) =>
  ({
    id: 3,
    name: 'Rex',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }) as PatientDetail;

function answer(map: Record<string, unknown>) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd in map) {
      const v = map[cmd];
      if (v instanceof Error) throw v;
      return v;
    }
    return [];
  });
}

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
  document.body.innerHTML = '';
});

describe('PatientInfo', () => {
  it('leaves sex empty with a placeholder when it was never recorded', () => {
    answer({});
    render(<PatientInfo patient={rex({ gender: undefined })} />, { wrapper });

    expect(screen.getByText('detail.patientInfo.placeholders.gender')).toBeInTheDocument();
    expect(screen.queryByText('entities:gender.unknown')).not.toBeInTheDocument();
  });

  it('shows one message when a save fails', async () => {
    answer({ update_patient: new Error('disk full') });
    const { container } = render(<PatientInfo patient={rex({ gender: 'Female' })} />, { wrapper });

    const genderSelect = container.querySelectorAll('.ant-select-selector')[2];
    fireEvent.mouseDown(genderSelect);
    fireEvent.click(await screen.findByText('entities:gender.male'));

    await waitFor(() => expect(document.querySelectorAll('.ant-notification-notice').length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelectorAll('.ant-notification-notice')).toHaveLength(1);
  });

  it('never saves the "-" shown for an empty colour', async () => {
    answer({ update_patient: { id: 3, name: 'Rex', isActive: true } });
    render(<PatientInfo patient={rex({ color: undefined })} />, { wrapper });

    const cell = screen.getByText('detail.patientInfo.labels.color').closest('th')!.nextElementSibling as HTMLElement;
    fireEvent.click(within(cell).getByText('-'));
    const box = await within(cell).findByRole('textbox');
    expect((box as HTMLTextAreaElement).value).toBe('');
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 13 });
    fireEvent.keyUp(box, { key: 'Enter', keyCode: 13 });

    await new Promise((r) => setTimeout(r, 700));
    const saved = invokeMock.mock.calls.filter(([cmd]) => cmd === 'update_patient');
    expect(saved.every(([, args]) => (args as { dto: { color?: string } }).dto.color !== '-')).toBe(true);
  });
});
