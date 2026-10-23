import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/services/invoke', () => ({ invoke: async () => [] }));
vi.mock('../../../components/forms/CreateHouseholdInline', () => ({ CreateHouseholdInline: () => null }));
vi.mock('../../../utils/themeStyles', () => ({
  useThemeColors: () => ({ hover: 'rgb(1, 2, 3)', textSecondary: 'rgb(4, 5, 6)', cardBg: 'rgb(7, 8, 9)', text: 'rgb(10, 11, 12)' }),
}));

import { HouseholdSection } from '../HouseholdSection';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <App>{children}</App>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe("patient's household colours", () => {
  it('follow the light or dark theme instead of fixed dark greys', () => {
    render(<HouseholdSection patientId={3} household={{ id: 8, householdName: 'Petrovski' }} />, { wrapper });

    const label = screen.getByText('detail.householdInfo.householdName').closest('th') as HTMLElement;
    const content = label.nextElementSibling as HTMLElement;
    expect(label.style.background).toBe('rgb(1, 2, 3)');
    expect(content.style.background).toBe('rgb(7, 8, 9)');
  });
});
