/**
 * Clinic profile (printed on PDF letterheads), VAT rates and invoice totals.
 * Mirrors the Rust models in `models/settings.rs` and `services/money.rs`.
 */

export interface ClinicProfile {
  name: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  /** ЕДБ */
  taxNumber: string | null;
  /** ЕМБС */
  registrationNumber: string | null;
  bankAccount: string | null;
  bankName: string | null;
  logoPath: string | null;
  /** Entered prices already include VAT. */
  pricesIncludeVat: boolean;
}

/** Every text field is sent; an empty one clears it. */
export interface UpdateClinicProfileInput {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  taxNumber: string;
  registrationNumber: string;
  bankAccount: string;
  bankName: string;
  pricesIncludeVat: boolean;
}

export interface TaxRate {
  id: number;
  name: string;
  percent: number;
  isDefault: boolean;
  isActive: boolean;
  displayOrder: number;
}

export interface CreateTaxRateInput {
  name: string;
  percent: number;
  isDefault?: boolean;
}

export interface UpdateTaxRateInput {
  name?: string;
  percent?: number;
  isDefault?: boolean;
  isActive?: boolean;
}

/** One line as the backend's money math sees it. */
export interface MoneyLine {
  unitPrice: number;
  quantity: number;
  vatPercent: number | null;
  vatLabel: string | null;
}

export interface VatGroupTotals {
  label: string;
  percent: number;
  net: number;
  vat: number;
  gross: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  total: number;
  netTotal: number;
  vatTotal: number;
  pricesIncludeVat: boolean;
  /** Empty when no line has a VAT rate. */
  vatGroups: VatGroupTotals[];
  lineAmounts: number[];
}
