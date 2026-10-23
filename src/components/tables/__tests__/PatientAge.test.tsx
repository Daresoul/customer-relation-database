/**
 * dates-time #12: the household pets list and the patient table each had
 * their own age maths (a 10-day-old puppy was "0 months"), unlike the
 * patient banner (formatPatientAge).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import dayjs from 'dayjs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${key}:${o.count}` : key),
  }),
}));
vi.mock('../../../hooks/useSpecies', () => ({ useSpecies: () => ({ data: [], isLoading: false }) }));

import { PatientTable } from '../PatientTable';
import { AnimalsSection } from '../../../pages/HouseholdDetail/AnimalsSection';

const tenDaysAgo = dayjs().subtract(10, 'day').format('YYYY-MM-DD');

function wrap(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <App>{node}</App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('patient age in lists', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('the patient table counts a young puppy in weeks', () => {
    wrap(<PatientTable patients={[{ id: 1, name: 'Rex', species: 'Dog', dateOfBirth: tenDaysAgo, isActive: true } as never]} />);
    expect(screen.getByText('patients:chart.age.weeks:1')).toBeInTheDocument();
  });

  it('the household pets list counts it the same way', () => {
    wrap(<AnimalsSection householdId={3} patients={[{ id: 1, name: 'Rex', species: 'Dog', dateOfBirth: tenDaysAgo, status: 'active' } as never]} />);
    expect(screen.getByText('patients:chart.age.weeks:1')).toBeInTheDocument();
  });
});
