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

/// Amount in cents, half-up (prices are entered with at most two decimals).
fn to_cents(amount: f64) -> i64 {
    let scaled = amount * 100.0;
    (scaled + scaled.signum() * 1e-6).round() as i64
}

/// Basis points (hundredths of a percent), half-up.
fn to_basis_points(percent: f64) -> i64 {
    to_cents(percent)
}

/// `numerator / denominator` rounded half-up, for non-negative values.
fn div_half_up(numerator: i128, denominator: i128) -> i64 {
    ((2 * numerator + denominator) / (2 * denominator)) as i64
}

fn from_cents(cents: i64) -> f64 {
    cents as f64 / 100.0
}

/// Totals of an invoice, worked in integer cents:
/// - each line is unit price (to the cent) × quantity;
/// - lines are grouped by VAT rate (a line without a rate is 0%);
/// - the discount comes off each group, rounded half-up once per group, so
///   an invoice without rates totals exactly what it always did;
/// - the group is then split into net and VAT, half-up: with prices that
///   include VAT the VAT is taken out, with net prices it is added on.
///
/// The screen and the invoice PDF both show these numbers.
pub fn invoice_totals(lines: &[MoneyLine], discount_percent: Option<f64>, prices_include_vat: bool) -> InvoiceTotals {
    let discount_bp = to_basis_points(discount_percent.unwrap_or(0.0)).clamp(0, 10_000) as i128;

    // (rate in basis points, label, amount in cents), in order of first appearance.
    let mut groups: Vec<(i64, String, i64)> = Vec::new();
    let mut line_amounts = Vec::with_capacity(lines.len());
    let mut any_rate = false;
    for line in lines {
        let amount = to_cents(line.unit_price) * line.quantity as i64;
        line_amounts.push(from_cents(amount));
        any_rate |= line.vat_percent.is_some();
        let rate = to_basis_points(line.vat_percent.unwrap_or(0.0));
        let label = match (&line.vat_label, line.vat_percent) {
            (Some(label), Some(_)) => label.clone(),
            (_, Some(p)) => format!("{}%", p),
            _ => "0%".to_string(),
        };
        match groups.iter_mut().find(|(r, _, _)| *r == rate) {
            Some(group) => group.2 += amount,
            None => groups.push((rate, label, amount)),
        }
    }

    let (mut subtotal, mut discount, mut net_total, mut vat_total, mut total) = (0i64, 0i64, 0i64, 0i64, 0i64);
    let mut vat_groups = Vec::new();
    for (rate, label, amount) in groups {
        let discounted = div_half_up(amount as i128 * (10_000 - discount_bp), 10_000);
        let rate = rate as i128;
        let (net, vat) = if prices_include_vat {
            let net = div_half_up(discounted as i128 * 10_000, 10_000 + rate);
            (net, discounted - net)
        } else {
            (discounted, div_half_up(discounted as i128 * rate, 10_000))
        };
        subtotal += amount;
        discount += amount - discounted;
        net_total += net;
        vat_total += vat;
        total += net + vat;
        vat_groups.push(VatGroupTotals {
            label,
            percent: rate as f64 / 100.0,
            net: from_cents(net),
            vat: from_cents(vat),
            gross: from_cents(net + vat),
        });
    }

    InvoiceTotals {
        subtotal: from_cents(subtotal),
        discount_amount: from_cents(discount),
        total: from_cents(total),
        net_total: from_cents(net_total),
        vat_total: from_cents(vat_total),
        prices_include_vat,
        vat_groups: if any_rate { vat_groups } else { Vec::new() },
        line_amounts,
    }
}
