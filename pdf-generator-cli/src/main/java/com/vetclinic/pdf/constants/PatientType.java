package com.vetclinic.pdf.constants;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;

public enum PatientType {

    DOG("DOG", "куче"),
    CAT("CAT", "маче"),
    RABBIT("RABBIT", "зајак");

    private String profileCode;
    private String profileTranslated;

    PatientType(String profileCode, String profileTranslated) {
        this.profileCode = profileCode;
        this.profileTranslated = profileTranslated;
    }

    public String getCode() {
        return profileCode;
    }

    public void setProfileCode(String profileCode) {
        this.profileCode = profileCode;
    }

    public String getProfileTranslated() {
        return profileTranslated;
    }

    public void setProfileTranslated(String profileTranslated) {
        this.profileTranslated = profileTranslated;
    }

    public static List<PatientType> getAllPatientTypes() {
        List<PatientType> types = new ArrayList<>();
        types.add(DOG);
        types.add(CAT);
        types.add(RABBIT);
        return types;
    }

    public static PatientType getPatientTypeForCode(String profileCodeFromLabSample) {
        if (profileCodeFromLabSample == null || profileCodeFromLabSample.isEmpty()) {
            return null;
        }
        List<PatientType> profiles = getAllPatientTypes();
        for(PatientType profile : profiles) {
            if (StringUtils.containsIgnoreCase(profileCodeFromLabSample, profile.getCode())) {
                return profile;
            }
        }

        return null;
    }

    @Override
    public String toString() {
        return profileTranslated;
    }
}
