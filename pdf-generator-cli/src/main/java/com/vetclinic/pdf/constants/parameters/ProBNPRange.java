package com.vetclinic.pdf.constants.parameters;

import com.vetclinic.pdf.constants.PatientType;

/**
 * Stub ProBNPRange class for compilation - simplified for PDF CLI
 */
public class ProBNPRange extends Range {
    private String highRiskRanges;
    private String heartFailureRanges;
    private String chfRanges;

    public ProBNPRange(double lowFromNormalRange, double highFromNormalRange,
                      String highRiskRanges, String heartFailureRanges,
                      String chfRanges, PatientType patientType) {
        super(lowFromNormalRange, highFromNormalRange, patientType);
        this.highRiskRanges = highRiskRanges;
        this.heartFailureRanges = heartFailureRanges;
        this.chfRanges = chfRanges;
    }

    public String getHighRiskRanges() {
        return highRiskRanges != null ? highRiskRanges : "";
    }

    public String getHeartFailureRanges() {
        return heartFailureRanges != null ? heartFailureRanges : "";
    }

    public String getCHFRanges() {
        return chfRanges != null ? chfRanges : "";
    }
}
