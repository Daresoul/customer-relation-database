//! Invoice money math.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One invoice line as the money math sees it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MoneyLine {
    pub unit_price: f64,
    pub quantity: i32,
    #[ts(optional)]
    #[serde(default)]
    pub vat_percent: Option<f64>,
    #[ts(optional)]
    #[serde(default)]
    pub vat_label: Option<String>,
}

/// One VAT rate's share of an invoice.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct VatGroupTotals {
    pub label: String,
    pub percent: f64,
    pub net: f64,
    pub vat: f64,
    pub gross: f64,
}

/// An invoice's totals.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct InvoiceTotals {
    pub subtotal: f64,
    pub discount_amount: f64,
    pub total: f64,
    pub net_total: f64,
    pub vat_total: f64,
    pub prices_include_vat: bool,
    pub vat_groups: Vec<VatGroupTotals>,
    pub line_amounts: Vec<f64>,
}

pub fn invoice_totals(_lines: &[MoneyLine], _discount_percent: Option<f64>, prices_include_vat: bool) -> InvoiceTotals {
    InvoiceTotals {
        subtotal: 0.0,
        discount_amount: 0.0,
        total: 0.0,
        net_total: 0.0,
        vat_total: 0.0,
        prices_include_vat,
        vat_groups: Vec::new(),
        line_amounts: Vec::new(),
    }
}
