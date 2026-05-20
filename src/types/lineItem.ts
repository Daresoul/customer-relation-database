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
  createdAt: string;
  updatedAt: string;
}

export interface CreateLineItemTemplateInput {
  name: string;
  description?: string;
  defaultPrice: number;
  currencyId: number;
}

export interface UpdateLineItemTemplateInput {
  name?: string;
  description?: string;
  defaultPrice?: number;
  currencyId?: number;
  displayOrder?: number;
  isActive?: boolean;
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
}
