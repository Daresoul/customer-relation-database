package com.vetclinic.pdf.constants;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

public enum SampleType {

    WHOLE_BLOOD("whole blood", "полна крв"),
    SERUM("serum", "серум"),
    SERUM_PLASMA("serum plasma", "серум плазма");

    private String sampleCode;
    private String sampleTranslated;

    SampleType(String sampleCode, String sampleTranslated) {
        this.sampleCode = sampleCode;
        this.sampleTranslated = sampleTranslated;
    }

    public static SampleType getPointcareSampleTypeForCode(String code) {
        if (code == null || code.isEmpty()) {
            return null;
        }
        List<SampleType> types = getAllSampleTypes();
        for(SampleType type : types) {
            if (StringUtils.equalsIgnoreCase(code, type.getSampleCode())) {
                return type;
            }
        }
        return null;
    }

    public static List<SampleType> getAllSampleTypes() {
        List<SampleType> sampleTypes = new ArrayList<>();
        sampleTypes.add(WHOLE_BLOOD);
        sampleTypes.add(SERUM);
        sampleTypes.add(SERUM_PLASMA);
        return sampleTypes;
    }

    public String getSampleCode() {
        return sampleCode;
    }

    public void setSampleCode(String sampleCode) {
        this.sampleCode = sampleCode;
    }

    public String getSampleTranslated() {
        return sampleTranslated;
    }

    public void setSampleTranslated(String sampleTranslated) {
        this.sampleTranslated = sampleTranslated;
    }
}
