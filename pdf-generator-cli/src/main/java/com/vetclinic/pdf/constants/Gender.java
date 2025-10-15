package com.vetclinic.pdf.constants;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

public enum Gender {

    MALE("M", "мажјак"),
    MALE_V2("male", "мажјак"),
    FEMALE("F", "женка"),
    FEMALE_V2("female", "женка");

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

    @Override
    public String toString() {
        return genderTranslated;
    }
}
