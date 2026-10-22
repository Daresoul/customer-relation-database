package com.vetclinic.pdf.util;

import com.vetclinic.pdf.constants.Indicator;

/**
 * Classifies an analyzer value against a reference range. Accepts a decimal
 * comma and a leading {@code >}/{@code <}; anything it cannot read, or a value
 * without a range, is {@link Indicator#UNKNOWN} (printed without a colour).
 */
public final class ResultClassifier {

    private ResultClassifier() {
    }

    public static Indicator classify(String result, Double low, Double high) {
        if (result == null) {
            return Indicator.UNKNOWN;
        }
        String s = result.trim();
        char comparator = 0;
        if (s.startsWith(">") || s.startsWith("<")) {
            comparator = s.charAt(0);
            s = s.substring(1);
            if (s.startsWith("=")) {
                s = s.substring(1);
            }
        }
        Double value = parseNumber(s);
        if (value == null || low == null || high == null) {
            return Indicator.UNKNOWN;
        }
        if (comparator == '>') {
            return value >= high ? Indicator.HIGH : Indicator.UNKNOWN;
        }
        if (comparator == '<') {
            return value <= low ? Indicator.LOW : Indicator.UNKNOWN;
        }
        if (value < low) {
            return Indicator.LOW;
        }
        if (value > high) {
            return Indicator.HIGH;
        }
        return Indicator.NORMAL;
    }

    /** A plain number, with "," accepted as the decimal mark; null otherwise. */
    public static Double parseNumber(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim().replace(',', '.');
        if (t.isEmpty()) {
            return null;
        }
        try {
            double d = Double.parseDouble(t);
            return Double.isNaN(d) || Double.isInfinite(d) ? null : d;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Splits "low-high" (a leading minus on low is allowed); null when it is not two numbers. */
    public static Double[] parseRange(String range) {
        if (range == null) {
            return null;
        }
        String r = range.trim().replace('–', '-');
        int dash = r.indexOf('-', 1);
        if (dash < 0) {
            return null;
        }
        Double low = parseNumber(r.substring(0, dash));
        Double high = parseNumber(r.substring(dash + 1));
        // Devices send "0-0" for analytes that have no reference range.
        if (low == null || high == null || (low == 0 && high == 0)) {
            return null;
        }
        return new Double[]{low, high};
    }
}
