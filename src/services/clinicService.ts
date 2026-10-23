import { ApiService } from './api';
import type {
  ClinicProfile,
  UpdateClinicProfileInput,
  TaxRate,
  CreateTaxRateInput,
  UpdateTaxRateInput,
  MoneyLine,
  InvoiceTotals,
} from '../types/clinic';

/**
 * Clinic profile, VAT rates and invoice totals. The DTOs use serde
 * camelCase, so every call goes through invokeRaw.
 */
export class ClinicService {
  static getProfile(): Promise<ClinicProfile> {
    return ApiService.invokeRaw<ClinicProfile>('get_clinic_profile');
  }

  static updateProfile(input: UpdateClinicProfileInput): Promise<ClinicProfile> {
    return ApiService.invokeRaw<ClinicProfile>('update_clinic_profile', { input });
  }

  /** `path`: the PNG or JPG picked by the user; the app keeps its own copy. */
  static setLogo(path: string): Promise<ClinicProfile> {
    return ApiService.invokeRaw<ClinicProfile>('set_clinic_logo', { path });
  }

  static removeLogo(): Promise<ClinicProfile> {
    return ApiService.invokeRaw<ClinicProfile>('remove_clinic_logo');
  }

  /** The logo as a data URL, or null. */
  static getLogo(): Promise<string | null> {
    return ApiService.invokeRaw<string | null>('get_clinic_logo');
  }

  static getTaxRates(activeOnly = false): Promise<TaxRate[]> {
    return ApiService.invokeRaw<TaxRate[]>('get_tax_rates', { activeOnly });
  }

  static createTaxRate(input: CreateTaxRateInput): Promise<TaxRate> {
    return ApiService.invokeRaw<TaxRate>('create_tax_rate', { input });
  }

  static updateTaxRate(id: number, input: UpdateTaxRateInput): Promise<TaxRate> {
    return ApiService.invokeRaw<TaxRate>('update_tax_rate', { id, input });
  }

  /** Totals worked out exactly as on the invoice PDF. */
  static calculateTotals(lines: MoneyLine[], discountPercent: number | null | undefined): Promise<InvoiceTotals> {
    return ApiService.invokeRaw<InvoiceTotals>('calculate_invoice_totals', {
      lines,
      discountPercent: discountPercent ?? null,
    });
  }
}
