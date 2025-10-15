package com.vetclinic.pdf.constants;

import org.apache.commons.lang3.StringUtils;

import java.util.*;

/**
 * This has been developed primarily for Exigo XML results but will be used for Pointcare and Healvet
 * as well since they have dog and cat .. we check with ignore-case on anyway
 */
public enum AnalysisProfile {
    DOG("DOG", "куче"),
    CAT("CAT", "маче"),
    RABBIT("RABBIT", "зајак"),
    BACKGROUND("BACKGROUND", "контролна"),
    NORMAL_CONTROL("NORMAL CONTROL", "позадинска");

    private String profileCode;
    private String profileTranslated;

    AnalysisProfile(String profileCode, String profileTranslated) {
        this.profileCode = profileCode;
        this.profileTranslated = profileTranslated;
    }

    public String getProfileCode() {
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

    public static List<AnalysisProfile> getAllAnalysisProfiles() {
        List<AnalysisProfile> profiles = new ArrayList<>();
        profiles.add(DOG);
        profiles.add(CAT);
        profiles.add(RABBIT);
//        profiles.add(BACKGROUND);
//        profiles.add(NORMAL_CONTROL);
        return profiles;
    }

    public static AnalysisProfile getAnalysisProfileForCode(String profileCodeFromLabSample) {
        if (profileCodeFromLabSample == null || profileCodeFromLabSample.isEmpty()) {
            return null;
        }
        List<AnalysisProfile> profiles = getAllAnalysisProfiles();
        for(AnalysisProfile profile : profiles) {
            if (StringUtils.containsIgnoreCase(profileCodeFromLabSample, profile.getProfileCode())) {
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
