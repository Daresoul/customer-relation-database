package com.vetclinic.pdf.constants.parameters;

import com.vetclinic.pdf.constants.PatientType;

/**
 * Stub CortisolRange class for compilation - simplified for PDF CLI
 */
public class CortisolRange extends Range {
    private String lowRanges;
    private String flatRanges;
    private String highRanges;
    private String overtopRanges;
    private boolean isBeforeACTH;

    public CortisolRange(double lowFromNormalRange, double highFromNormalRange,
                        String lowRanges, String flatRanges,
                        String highRanges, String overtopRanges,
                        PatientType patientType, boolean isBeforeACTH) {
        super(lowFromNormalRange, highFromNormalRange, patientType);
        this.lowRanges = lowRanges;
        this.flatRanges = flatRanges;
        this.highRanges = highRanges;
        this.overtopRanges = overtopRanges;
        this.isBeforeACTH = isBeforeACTH;
    }

    public String getLowRanges() {
        return lowRanges != null ? lowRanges : "";
    }

    public String getFlatRanges() {
        return flatRanges != null ? flatRanges : "";
    }

    public String getHighRanges() {
        return highRanges != null ? highRanges : "";
    }

    public String getOvertopRanges() {
        return overtopRanges != null ? overtopRanges : "";
    }

    public boolean isBeforeACTH() {
        return isBeforeACTH;
    }
}
