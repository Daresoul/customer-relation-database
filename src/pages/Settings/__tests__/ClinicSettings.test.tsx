import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { App } from 'antd';
import ClinicSettings from '../components/ClinicSettings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@tauri-apps/api/dialog', () => ({ open: vi.fn() }));

const profile = {
  name: 'Д-р Ана Тестовска',
  address: 'Партизанска 5',
  city: '7000 Битола',
  phone: null,
  email: null,
  taxNumber: '4002999111222',
  registrationNumber: null,
  bankAccount: null,
  bankName: null,
  logoPath: null,
  pricesIncludeVat: true,
};
const rates = [
  { id: 1, name: 'ДДВ 18%', percent: 18, isDefault: false, isActive: true, displayOrder: 0 },
  { id: 2, name: 'ДДВ 5%', percent: 5, isDefault: true, isActive: true, displayOrder: 1 },
];
const updateProfile = vi.fn((..._args: unknown[]) => Promise.resolve(profile));
const updateRate = vi.fn((..._args: unknown[]) => Promise.resolve(rates[0]));
const createRate = vi.fn((..._args: unknown[]) => Promise.resolve(rates[0]));

vi.mock('@/hooks/useClinic', () => ({
  useClinicProfile: () => ({ data: profile, isLoading: false }),
  useUpdateClinicProfile: () => ({ mutateAsync: updateProfile, isPending: false }),
  useClinicLogo: () => ({ data: null }),
  useSetClinicLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveClinicLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTaxRates: () => ({ data: rates, isLoading: false }),
  useCreateTaxRate: () => ({ mutateAsync: createRate, isPending: false }),
  useUpdateTaxRate: () => ({ mutateAsync: updateRate, isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  render(
    <App>
      <ClinicSettings />
    </App>,
  );
}

describe('Clinic settings', () => {
  it('shows the saved profile', () => {
    renderPage();
    expect(screen.getByLabelText('settings:clinic.name')).toHaveValue('Д-р Ана Тестовска');
    expect(screen.getByLabelText('settings:clinic.taxNumber')).toHaveValue('4002999111222');
  });

  it('saves every field, with blanks as empty', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('settings:clinic.phone'), { target: { value: '047 111 222' } });
    fireEvent.change(screen.getByLabelText('settings:clinic.city'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /settings:clinic.save/ }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0]).toEqual({
      name: 'Д-р Ана Тестовска',
      address: 'Партизанска 5',
      city: '',
      phone: '047 111 222',
      email: '',
      taxNumber: '4002999111222',
      registrationNumber: '',
      bankAccount: '',
      bankName: '',
      pricesIncludeVat: true,
    });
  });

  it('saves prices as net when the clinic picks that', async () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('settings:vat.pricesNet'));
    fireEvent.click(screen.getByRole('button', { name: /settings:clinic.save/ }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0]).toMatchObject({ pricesIncludeVat: false });
  });

  it('lists the VAT rates and marks the default', () => {
    renderPage();
    const row5 = screen.getByText('ДДВ 5%').closest('tr') as HTMLElement;
    expect(within(row5).getByText('settings:vat.default')).toBeInTheDocument();
  });

  it('makes another rate the default', async () => {
    renderPage();
    const row18 = screen.getByText('ДДВ 18%').closest('tr') as HTMLElement;
    fireEvent.click(within(row18).getByRole('button', { name: /settings:vat.makeDefault/ }));
    await waitFor(() => expect(updateRate).toHaveBeenCalledWith({ id: 1, input: { isDefault: true } }));
  });
});
