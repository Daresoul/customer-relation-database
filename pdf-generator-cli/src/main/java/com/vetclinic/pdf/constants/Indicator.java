package com.vetclinic.pdf.constants;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

public enum Indicator {

    HIGH("H"),
    NORMAL("N"),
    LOW("L");

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

    public static Indicator getIndicatorObjectForCode(String code) {
        if (code == null || code.isEmpty()) {
            return null;
        }
        List<Indicator> indicators = getAllIndicators();
        for(Indicator indicator : indicators) {
            if (StringUtils.containsIgnoreCase(code, indicator.getIndicator())) {
                return indicator;
            }
        }

        return null;
    }
}
