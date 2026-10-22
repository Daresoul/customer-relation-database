package com.vetclinic.pdf.constants;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

public enum Gender {

    MALE("M", "мажјак"),
    MALE_V2("male", "мажјак"),
    FEMALE("F", "женка"),
    FEMALE_V2("female", "женка"),
    UNKNOWN("", "непознат");

    private static final java.util.Set<String> MALE_VALUES = new java.util.HashSet<>(java.util.Arrays.asList(
            "male", "m", "м", "мажјак", "машко", "маж"));
    private static final java.util.Set<String> FEMALE_VALUES = new java.util.HashSet<>(java.util.Arrays.asList(
            "female", "f", "ж", "женка", "женско"));

    private String genderCode;
    private String genderTranslated;

    Gender(String genderCode, String genderTranslated) {
        this.genderCode = genderCode;
        this.genderTranslated = genderTranslated;
    }

    public String getGenderCode() {
        return genderCode;
    }

    public void setGenderCode(String genderCode) {
        this.genderCode = genderCode;
    }

    public String getGenderTranslated() {
        return genderTranslated;
    }

    public void setGenderTranslated(String genderTranslated) {
        this.genderTranslated = genderTranslated;
    }

    public static List<Gender> getAllGenders() {
        List<Gender> genders = new ArrayList<>();
        genders.add(MALE);
//        genders.add(MALE_V2);
        genders.add(FEMALE);
//        genders.add(FEMALE_V2);
        return genders;
    }

    private static List<Gender> getAllGendersAnyType() {
        List<Gender> genders = new ArrayList<>();
        genders.add(MALE);
        genders.add(MALE_V2);
        genders.add(FEMALE);
        genders.add(FEMALE_V2);
        return genders;
    }

    public static Gender getGenderForCode(String code) {
        if (code == null || code.isEmpty()) {
            return null;
        }
        List<Gender> types = getAllGendersAnyType();
        for(Gender type : types) {
            if (StringUtils.containsIgnoreCase(code, type.getGenderCode())) {
                return type;
            }
        }
        return null;
    }

    /** Exact match on the stored sex value (English or Macedonian); anything else is UNKNOWN. */
    public static Gender fromPatientValue(String value) {
        if (value == null) {
            return UNKNOWN;
        }
        String v = value.trim().toLowerCase(java.util.Locale.ROOT);
        if (FEMALE_VALUES.contains(v)) {
            return FEMALE;
        }
        if (MALE_VALUES.contains(v)) {
            return MALE;
        }
        return UNKNOWN;
    }

    @Override
    public String toString() {
        return genderTranslated;
    }
}
