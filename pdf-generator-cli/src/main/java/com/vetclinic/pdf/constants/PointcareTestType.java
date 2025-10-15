package com.vetclinic.pdf.constants;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

public enum PointcareTestType {

     HEALTH_CHECKING_PROFILE("55", "општ профил"),
     KIDNEY_PROFILE("62", "профил на бубрези"),
     LIVER_PROFILE("61", "профил на црн дроб"),
     ELECTROLYTES("57", "електролити");

    private String code;
    private String translated;

    PointcareTestType(String code, String translated) {
        this.code = code;
        this.translated = translated;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getTranslated() {
        return translated;
    }

    public void setTranslated(String translated) {
        this.translated = translated;
    }

    public static List<PointcareTestType> getAllTypes() {
        List<PointcareTestType> types = new ArrayList<>();
        types.add(HEALTH_CHECKING_PROFILE);
        types.add(KIDNEY_PROFILE);
        types.add(LIVER_PROFILE);
        types.add(ELECTROLYTES);
        return types;
    }

    public static PointcareTestType getTestTypeForCode(String code) {
        if (code == null || code.isEmpty()) {
            return null;
        }
        List<PointcareTestType> types = getAllTypes();
        for(PointcareTestType type : types) {
            if (StringUtils.equalsIgnoreCase(code, type.getCode())) {
                return type;
            }
        }
        return null;
    }

    @Override
    public String toString() {
        return translated;
    }
}
