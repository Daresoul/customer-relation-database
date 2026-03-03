package com.vetclinic.pdf.models.parameters;

import com.vetclinic.pdf.constants.Indicator;
import com.vetclinic.pdf.constants.PcrTestCode;

import java.util.ArrayList;
import java.util.List;

/**
 * PCR Parameter model for MNCHIP PointCare PCR Analyzer results.
 * Extends Parameter with PCR-specific fields like curve data and lot number.
 */
public class PcrParameter extends Parameter {

    private PcrTestCode testCode;
    private List<Double> curveData;
    private String sampleType;
    private String lotNumber;

    public PcrParameter() {
        super();
        this.curveData = new ArrayList<>();
    }

    public PcrParameter(PcrTestCode testCode, String result, String sampleType, String lotNumber) {
        super();
        this.testCode = testCode;
        this.sampleType = sampleType;
        this.lotNumber = lotNumber;
        this.curveData = new ArrayList<>();

        // Set name from test code
        if (testCode != null) {
            setName(testCode.getCode());
        }

        // Set result and determine indicator
        setResult(result);
        determineIndicator();

        // Set reference values (standard PCR threshold)
        setReferentValues(PcrTestCode.getNegativeRange());
    }

    public PcrTestCode getTestCode() {
        return testCode;
    }

    public void setTestCode(PcrTestCode testCode) {
        this.testCode = testCode;
        if (testCode != null) {
            setName(testCode.getCode());
        }
    }

    public List<Double> getCurveData() {
        return curveData;
    }

    public void setCurveData(List<Double> curveData) {
        this.curveData = curveData;
    }

    public String getSampleType() {
        return sampleType;
    }

    public void setSampleType(String sampleType) {
        this.sampleType = sampleType;
    }

    public String getLotNumber() {
        return lotNumber;
    }

    public void setLotNumber(String lotNumber) {
        this.lotNumber = lotNumber;
    }

    /**
     * Parse curve data from the PCR device format.
     * Format: "643#640#642#641#..." - fluorescence values separated by #
     *
     * @param curveDataString The raw curve data string
     */
    public void parseCurveData(String curveDataString) {
        if (curveDataString == null || curveDataString.isEmpty()) {
            return;
        }

        this.curveData = new ArrayList<>();
        String[] values = curveDataString.split("#");

        for (String value : values) {
            try {
                double fluorescence = Double.parseDouble(value.trim());
                this.curveData.add(fluorescence);
            } catch (NumberFormatException e) {
                // Skip invalid values
            }
        }
    }

    /**
     * Determine indicator based on Ct value.
     * - NoCt or empty result = Negative
     * - Ct > 36 = Negative
     * - Ct <= 36 = Positive (abnormal/HIGH indicator)
     */
    public void determineIndicator() {
        String result = getResult();

        if (result == null || result.isEmpty() || result.equalsIgnoreCase("NoCt")) {
            setIndicator(Indicator.NORMAL); // Negative result
            return;
        }

        try {
            double ctValue = Double.parseDouble(result);
            if (ctValue > 36) {
                setIndicator(Indicator.NORMAL); // Negative
            } else {
                setIndicator(Indicator.HIGH); // Positive - using HIGH to flag abnormal
            }
        } catch (NumberFormatException e) {
            // If result can't be parsed, treat as negative
            setIndicator(Indicator.NORMAL);
        }
    }

    /**
     * Check if this PCR result is positive (Ct <= 36)
     *
     * @return true if positive, false if negative
     */
    public boolean isPositive() {
        return getIndicator() == Indicator.HIGH;
    }

    /**
     * Get the indicator text for display
     *
     * @return "Positive(+)" or "Negative(-)"
     */
    public String getIndicatorText() {
        return isPositive() ? "Positive(+)" : "Negative(-)";
    }

    /**
     * Get the Macedonian indicator text for display
     *
     * @return "Позитивен(+)" or "Негативен(-)"
     */
    public String getIndicatorTextMacedonian() {
        return isPositive() ? "Позитивен(+)" : "Негативен(-)";
    }

    @Override
    public String toString() {
        return "PcrParameter{" +
                "testCode=" + (testCode != null ? testCode.getCode() : "null") +
                ", result='" + getResult() + '\'' +
                ", sampleType='" + sampleType + '\'' +
                ", lotNumber='" + lotNumber + '\'' +
                ", curveDataPoints=" + (curveData != null ? curveData.size() : 0) +
                ", indicator=" + getIndicator() +
                '}';
    }
}
