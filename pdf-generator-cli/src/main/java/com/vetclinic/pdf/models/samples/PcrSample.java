package com.vetclinic.pdf.models.samples;

import com.vetclinic.pdf.models.parameters.PcrParameter;

import java.util.ArrayList;
import java.util.List;

/**
 * PCR Sample model for MNCHIP PointCare PCR Analyzer results.
 * Extends Sample with PCR-specific metadata fields.
 */
public class PcrSample extends Sample {

    private String analyzerInfo;
    private String submitDateTime;
    private String printDateTime;
    private String operator;
    private String reviewer;
    private List<PcrParameter> pcrParameters;

    public PcrSample() {
        super();
        this.pcrParameters = new ArrayList<>();
    }

    public String getAnalyzerInfo() {
        return analyzerInfo;
    }

    public void setAnalyzerInfo(String analyzerInfo) {
        this.analyzerInfo = analyzerInfo;
    }

    public String getSubmitDateTime() {
        return submitDateTime;
    }

    public void setSubmitDateTime(String submitDateTime) {
        this.submitDateTime = submitDateTime;
    }

    public String getPrintDateTime() {
        return printDateTime;
    }

    public void setPrintDateTime(String printDateTime) {
        this.printDateTime = printDateTime;
    }

    public String getOperator() {
        return operator;
    }

    public void setOperator(String operator) {
        this.operator = operator;
    }

    public String getReviewer() {
        return reviewer;
    }

    public void setReviewer(String reviewer) {
        this.reviewer = reviewer;
    }

    public List<PcrParameter> getPcrParameters() {
        return pcrParameters;
    }

    public void setPcrParameters(List<PcrParameter> pcrParameters) {
        this.pcrParameters = pcrParameters;
    }

    public void addPcrParameter(PcrParameter parameter) {
        this.pcrParameters.add(parameter);
    }

    /**
     * Get the number of positive results in this sample
     *
     * @return count of positive PCR results
     */
    public int getPositiveCount() {
        int count = 0;
        for (PcrParameter param : pcrParameters) {
            if (param.isPositive()) {
                count++;
            }
        }
        return count;
    }

    /**
     * Check if any PCR result is positive
     *
     * @return true if at least one positive result
     */
    public boolean hasPositiveResults() {
        return getPositiveCount() > 0;
    }

    @Override
    public String toString() {
        return "PcrSample{" +
                "sampleId='" + getSampleId() + '\'' +
                ", patientId='" + getPatientId() + '\'' +
                ", analyzerInfo='" + analyzerInfo + '\'' +
                ", submitDateTime='" + submitDateTime + '\'' +
                ", pcrParameters=" + pcrParameters.size() +
                '}';
    }
}
