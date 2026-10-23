/**
 * Line Item Types for medical record pricing
 */

// Line Item Template (Settings - Reusable Templates)
export interface LineItemTemplate {
  id: number;
  name: string;
  description?: string;
  defaultPrice: number;
  currencyId: number;
  displayOrder: number;
  isActive: boolean;
  /** VAT rate a new line from this item starts with. */
  defaultTaxRateId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLineItemTemplateInput {
  name: string;
  description?: string;
  defaultPrice: number;
  currencyId: number;
  defaultTaxRateId?: number | null;
}

export interface UpdateLineItemTemplateInput {
  name?: string;
  description?: string;
  defaultPrice?: number;
  currencyId?: number;
  displayOrder?: number;
  isActive?: boolean;
  /** null removes the default rate. */
  defaultTaxRateId?: number | null;
}

// Medical Record Line Item (Per-Record Items)
export interface MedicalRecordLineItem {
  id?: number;                    // Undefined for new items
  templateId?: number;            // Undefined = custom item
  name: string;
  description?: string;
  unitPrice: number;
  currencyId: number;
  quantity: number;
  /** The line's VAT rate, and its name and percent when it was chosen. */
  taxRateId?: number | null;
  vatName?: string | null;
  vatPercent?: number | null;
  createdAt?: string;
}

// Input for creating/updating line items within a medical record
export interface CreateLineItemInput {
  templateId?: number;
  name: string;
  description?: string;
  unitPrice: number;
  currencyId: number;
  quantity?: number;  // Default 1
  /** Missing: the item's default rate; null: no rate. */
  taxRateId?: number | null;
}
