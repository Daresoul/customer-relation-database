package com.vetclinic.pdf.models.samples;

import com.vetclinic.pdf.constants.AnalysisProfile;
import com.vetclinic.pdf.models.parameters.Parameter;

import java.util.ArrayList;
import java.util.List;

/**
 * Sample type can be added if same sample types are across all devices
 */
public abstract class Sample {

    private String patientId;
    private AnalysisProfile analysisProfile;
    private String analysisDateAndTime;
    private String sampleId;
    private List<Parameter> parameters = new ArrayList<>();


    public String getPatientId() {
        return patientId;
    }

    public void setPatientId(String patientId) {
        this.patientId = patientId;
    }

    public AnalysisProfile getAnalysisProfile() {
        return analysisProfile;
    }

    public void setAnalysisProfile(AnalysisProfile analysisProfile) {
        this.analysisProfile = analysisProfile;
    }

    public String getAnalysisDateAndTime() {
        return analysisDateAndTime;
    }

    public void setAnalysisDateAndTime(String analysisDateAndTime) {
        this.analysisDateAndTime = analysisDateAndTime;
    }

    public String getSampleId() {
        return sampleId;
    }

    public void setSampleId(String sampleId) {
        this.sampleId = sampleId;
    }

    public List<Parameter> getParameters() {
        return parameters;
    }

    public void setParameters(List<Parameter> parameters) {
        this.parameters = parameters;
    }

    public void addParameter(Parameter parameter) {
        this.parameters.add(parameter);
    }

    @Override
    public String toString() {
        return "Sample{" +
                "patientId='" + patientId + '\'' +
                ", analysisProfile=" + analysisProfile +
                ", analysisDateAndTime='" + analysisDateAndTime + '\'' +
                ", sampleId='" + sampleId + '\'' +
                ", parameters=" + parameters +
                '}';
    }
}
