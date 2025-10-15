package com.vetclinic.pdf.models.samples;

/**
 *
 * Exigo device sample id (or sequence as it's named in the XML file) goes up to 1000 only
 * and then gets restarted
 *
 * */
public class ExigoSample extends Sample {

    private String deviceSerialNumber;
    private String analysisDate;
    private String analysisTime;

    public String getDeviceSerialNumber() {
        return deviceSerialNumber;
    }

    public void setDeviceSerialNumber(String deviceSerialNumber) {
        this.deviceSerialNumber = deviceSerialNumber;
    }

    public String getAnalysisDate() {
        return analysisDate;
    }

    public void setAnalysisDate(String analysisDate) {
        this.analysisDate = analysisDate;
        if (this.analysisTime != null) {
            setFullDateTimeOfIssue();
        }
    }
    public String getAnalysisTime() {
        return analysisTime;
    }

    public void setAnalysisTime(String analysisTime) {
        this.analysisTime = analysisTime;
        if (this.analysisDate != null) {
            setFullDateTimeOfIssue();
        }
    }

    private void setFullDateTimeOfIssue() {
        String fullDateTime = this.analysisDate + " " + this.analysisTime;
        super.setAnalysisDateAndTime(fullDateTime);

    }

}
