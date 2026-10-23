package com.vetclinic.pdf.constants;


import java.util.ArrayList;
import java.util.List;

public enum Indicator {

    HIGH("H"),
    NORMAL("N"),
    LOW("L"),
    // No colour: the value is not a number, or there is no range to compare with.
    UNKNOWN("?");

    private String indicator;

    Indicator(String indicator) {
        this.indicator = indicator;
    }

    public String getIndicator() {
        return indicator;
    }

    public void setIndicator(String indicator) {
        this.indicator = indicator;
    }

    public static List<Indicator> getAllIndicators() {
        List<Indicator> list = new ArrayList<>();
        list.add(Indicator.HIGH);
        list.add(Indicator.NORMAL);
        list.add(Indicator.LOW);
        return list;
    }
}
