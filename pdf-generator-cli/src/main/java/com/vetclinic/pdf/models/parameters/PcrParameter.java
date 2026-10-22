package com.vetclinic.pdf.models.parameters;

import com.vetclinic.pdf.constants.Indicator;
import com.vetclinic.pdf.constants.PcrTestCode;
import com.vetclinic.pdf.util.ResultClassifier;

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
    private Double threshold;
    private String deviceFlag;

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

    public Double getThreshold() {
        return threshold;
    }

    public void setThreshold(Double threshold) {
        this.threshold = threshold;
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

    private static final double DEFAULT_CUTOFF = 36;
    private static final java.util.regex.Pattern NEGATIVE_ABOVE =
            java.util.regex.Pattern.compile(">\\s*=?\\s*(\\d+(?:[.,]\\d+)?)");

    /**
     * Positive (HIGH) / negative (NORMAL) / no call (UNKNOWN). The device's own
     * call wins; without one, the Ct is compared with the device's range
     * ("&gt;36 or NoCt" means negative above 36), else 36. A value that is not a
     * Ct or NoCt gets no call.
     */
    public void determineIndicator() {
        Indicator fromDevice = callFromDeviceFlag(deviceFlag);
        if (fromDevice != null) {
            setIndicator(fromDevice);
            return;
        }
        String result = getResult();
        if (result != null && result.trim().equalsIgnoreCase("NoCt")) {
            setIndicator(Indicator.NORMAL);
            return;
        }
        Double ct = ResultClassifier.parseNumber(result);
        if (ct == null) {
            setIndicator(Indicator.UNKNOWN);
            return;
        }
        setIndicator(ct > negativeAbove() ? Indicator.NORMAL : Indicator.HIGH);
    }

    private double negativeAbove() {
        if (getReferentValues() != null) {
            java.util.regex.Matcher m = NEGATIVE_ABOVE.matcher(getReferentValues());
            if (m.find()) {
                Double cutoff = ResultClassifier.parseNumber(m.group(1));
                if (cutoff != null) {
                    return cutoff;
                }
            }
        }
        return DEFAULT_CUTOFF;
    }

    /** The device spells its call "Postive(+)" / "Negative(-)"; match on the prefix. */
    static Indicator callFromDeviceFlag(String flag) {
        if (flag == null) {
            return null;
        }
        String f = flag.trim().toLowerCase(java.util.Locale.ROOT);
        if (f.startsWith("pos")) {
            return Indicator.HIGH;
        }
        if (f.startsWith("neg")) {
            return Indicator.NORMAL;
        }
        return null;
    }

    public String getDeviceFlag() {
        return deviceFlag;
    }

    public void setDeviceFlag(String deviceFlag) {
        this.deviceFlag = deviceFlag;
    }

    /** The internal control: amplification means the run worked, not a pathogen. */
    public boolean isInternalControl() {
        return testCode == PcrTestCode.IC || "IC".equalsIgnoreCase(getName());
    }

    public boolean isPositive() {
        return getIndicator() == Indicator.HIGH;
    }

    public String getIndicatorText() {
        if (isInternalControl()) {
            return isPositive() ? "Valid" : "INVALID";
        }
        if (getIndicator() == Indicator.HIGH) {
            return "Positive(+)";
        }
        if (getIndicator() == Indicator.NORMAL) {
            return "Negative(-)";
        }
        return "—";
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
