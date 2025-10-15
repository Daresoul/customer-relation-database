package com.vetclinic.pdf.constants.parameters;

import com.vetclinic.pdf.constants.PatientType;

/**
 * Stub Range class for compilation - simplified for PDF CLI
 */
public class Range {
    private double lowRange;
    private double highRange;
    private PatientType patientType;

    public Range(double lowRange, double highRange, PatientType patientType) {
        this.lowRange = lowRange;
        this.highRange = highRange;
        this.patientType = patientType;
    }

    public double getLowRange() {
        return lowRange;
    }

    public double getHighRange() {
        return highRange;
    }

    public PatientType getPatientType() {
        return patientType;
    }

    public String getNormalRangesInStringRepresentation() {
        return lowRange + " - " + highRange;
    }
}
