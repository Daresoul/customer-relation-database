//! Invoice money math: one place, integer cents, half-up rounding.

use crate::services::money::{invoice_totals, MoneyLine};

fn line(price: f64, qty: i32) -> MoneyLine {
    MoneyLine { unit_price: price, quantity: qty, vat_percent: None, vat_label: None }
}

fn vat_line(price: f64, qty: i32, percent: f64) -> MoneyLine {
    MoneyLine {
        unit_price: price,
        quantity: qty,
        vat_percent: Some(percent),
        vat_label: Some(format!("ДДВ {}%", percent)),
    }
}

#[test]
fn lines_without_a_rate_have_no_vat() {
    let t = invoice_totals(&[line(1500.0, 1), line(500.0, 2)], None, true);
    assert_eq!(t.subtotal, 2500.0);
    assert_eq!(t.discount_amount, 0.0);
    assert_eq!(t.total, 2500.0);
    assert_eq!(t.vat_total, 0.0);
    assert!(t.vat_groups.is_empty());
    assert_eq!(t.line_amounts, vec![1500.0, 1000.0]);
}

/// Old records have no rates. Their totals must be what the invoice PDF
/// printed before: subtotal minus the discount, rounded half-up once.
#[test]
fn old_invoices_keep_their_totals_in_both_price_modes() {
    let cases: &[(&[(f64, i32)], f64, f64)] = &[
        (&[(101.0, 1)], 1.5, 99.49),
        (&[(101.0, 1)], 19.5, 81.31),
        (&[(2000.0, 1)], 10.0, 1800.0),
        (&[(1500.0, 1), (20.5, 3)], 7.5, 1444.39),
        (&[(1500.0, 1), (750.0, 2)], 0.0, 3000.0),
    ];
    for (items, discount, expected) in cases {
        let lines: Vec<MoneyLine> = items.iter().map(|(p, q)| line(*p, *q)).collect();
        for gross in [true, false] {
            let t = invoice_totals(&lines, Some(*discount), gross);
            assert_eq!(t.total, *expected, "{:?} at {}% (gross {})", items, discount, gross);
            assert_eq!(t.vat_total, 0.0);
            assert!(t.vat_groups.is_empty());
        }
    }
}

#[test]
fn whole_denar_prices_with_whole_percent_discounts_are_exact() {
    for price in (1..=3000).step_by(7) {
        for discount in 0..100 {
            let t = invoice_totals(&[line(price as f64, 1)], Some(discount as f64), true);
            let exact_cents = price as i64 * (100 - discount);
            assert_eq!((t.total * 100.0).round() as i64, exact_cents, "{} at {}%", price, discount);
            assert_eq!(((t.subtotal - t.discount_amount) * 100.0).round(), (t.total * 100.0).round());
        }
    }
}

#[test]
fn prices_with_vat_included_are_split_into_net_and_vat_per_rate() {
    let t = invoice_totals(&[vat_line(1180.0, 1, 18.0), vat_line(525.0, 2, 5.0)], None, true);
    assert_eq!(t.total, 2230.0);
    assert_eq!(t.vat_total, 230.0);
    assert_eq!(t.net_total, 2000.0);
    assert_eq!(t.vat_groups.len(), 2);
    let g18 = &t.vat_groups[0];
    assert_eq!((g18.label.as_str(), g18.percent, g18.net, g18.vat, g18.gross), ("ДДВ 18%", 18.0, 1000.0, 180.0, 1180.0));
    let g5 = &t.vat_groups[1];
    assert_eq!((g5.label.as_str(), g5.percent, g5.net, g5.vat, g5.gross), ("ДДВ 5%", 5.0, 1000.0, 50.0, 1050.0));
}

#[test]
fn net_prices_get_the_vat_added() {
    let t = invoice_totals(&[vat_line(1000.0, 1, 18.0), vat_line(500.0, 2, 5.0)], None, false);
    assert_eq!(t.subtotal, 2000.0);
    assert_eq!(t.net_total, 2000.0);
    assert_eq!(t.vat_total, 230.0);
    assert_eq!(t.total, 2230.0);
}

#[test]
fn vat_is_rounded_half_up_to_the_cent() {
    // 100 with 18% included: net 84.745… → 84.75, VAT 15.25.
    let t = invoice_totals(&[vat_line(100.0, 1, 18.0)], None, true);
    assert_eq!((t.net_total, t.vat_total, t.total), (84.75, 15.25, 100.0));
    // 84.75 net at 18%: VAT 15.255 → 15.26.
    let t = invoice_totals(&[vat_line(84.75, 1, 18.0)], None, false);
    assert_eq!((t.vat_total, t.total), (15.26, 100.01));
    // An exact half cent goes up: 0.05 at 10% is 0.005 VAT.
    let t = invoice_totals(&[vat_line(0.05, 1, 10.0)], None, false);
    assert_eq!((t.vat_total, t.total), (0.01, 0.06));
}

#[test]
fn the_discount_comes_off_each_rate_before_the_vat_is_split() {
    let t = invoice_totals(&[vat_line(1180.0, 1, 18.0), vat_line(1050.0, 1, 5.0)], Some(10.0), true);
    assert_eq!(t.subtotal, 2230.0);
    assert_eq!(t.discount_amount, 223.0);
    assert_eq!(t.total, 2007.0);
    assert_eq!((t.vat_groups[0].net, t.vat_groups[0].vat, t.vat_groups[0].gross), (900.0, 162.0, 1062.0));
    assert_eq!((t.vat_groups[1].net, t.vat_groups[1].vat, t.vat_groups[1].gross), (900.0, 45.0, 945.0));
    assert_eq!(t.vat_total, 207.0);
}

#[test]
fn a_line_without_a_rate_on_a_vat_invoice_counts_as_zero_percent() {
    let t = invoice_totals(&[vat_line(1180.0, 1, 18.0), line(500.0, 1)], None, true);
    assert_eq!(t.vat_groups.len(), 2);
    let none = &t.vat_groups[1];
    assert_eq!((none.label.as_str(), none.percent, none.net, none.vat, none.gross), ("0%", 0.0, 500.0, 0.0, 500.0));
    assert_eq!(t.total, 1680.0);
}

#[test]
fn lines_with_the_same_rate_share_one_group() {
    let t = invoice_totals(&[vat_line(118.0, 1, 18.0), vat_line(1050.0, 1, 5.0), vat_line(236.0, 1, 18.0)], None, true);
    assert_eq!(t.vat_groups.len(), 2);
    assert_eq!(t.vat_groups[0].gross, 354.0);
    assert_eq!(t.vat_groups[0].vat, 54.0);
}

#[test]
fn cents_add_up_without_float_drift() {
    let t = invoice_totals(&[line(0.1, 1), line(0.1, 1), line(0.1, 1), line(20.5, 3)], None, true);
    assert_eq!(t.subtotal, 61.8);
    assert_eq!(t.line_amounts, vec![0.1, 0.1, 0.1, 61.5]);
}
