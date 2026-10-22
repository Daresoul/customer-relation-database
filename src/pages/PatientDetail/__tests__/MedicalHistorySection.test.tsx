import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts && 'shown' in opts ? `${key}:${opts.shown}/${opts.total}` : key) }),
}));

const refetch = vi.fn();
const calls: Array<unknown> = [];
const state: { data?: unknown; isError: boolean; error: unknown } = { isError: false, error: null };
vi.mock('@/hooks/useMedicalRecords', () => ({
  useMedicalRecords: (_id: number, _filter: unknown, pagination: unknown) => {
    calls.push(pagination);
    return { data: state.data, isLoading: false, isError: state.isError, error: state.error, refetch };
  },
}));
vi.mock('../MedicalHistory/MedicalRecordCards', () => ({
  default: ({ records }: { records: Array<{ id: number }> }) => <div>cards:{records.length}</div>,
}));
vi.mock('@/components/MedicalRecordModal/MedicalRecordModal', () => ({ default: () => null }));

import MedicalHistorySection from '../MedicalHistory/MedicalHistorySection';

function renderSection() {
  return render(
    <App>
      <MedicalHistorySection patientId={3} patientName="Rex" />
    </App>,
  );
}

const records = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: from + i + 1 }));

describe('MedicalHistorySection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    calls.length = 0;
    state.data = undefined;
    state.isError = false;
    state.error = null;
    document.body.innerHTML = '';
  });

  it('shows a load error with Retry, not "no records", when the history fails to load', () => {
    state.isError = true;
    state.error = new Error('database is locked');
    renderSection();

    expect(screen.getByText('detail.medicalHistory.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('detail.medicalHistory.createFirstRecord')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('common:retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('says how many records are shown and loads the next page', () => {
    state.data = { records: records(50), total: 132, page: 1, pageSize: 50 };
    renderSection();

    expect(screen.getByText('detail.medicalHistory.showing:50/132')).toBeInTheDocument();
    fireEvent.click(screen.getByText('detail.medicalHistory.loadMore'));
    expect(calls.at(-1)).toEqual({ page: 1, pageSize: 100 });
  });

  it('offers no "load more" when every record is shown', () => {
    state.data = { records: records(3), total: 3, page: 1, pageSize: 50 };
    renderSection();

    expect(screen.queryByText('detail.medicalHistory.loadMore')).not.toBeInTheDocument();
  });
});
