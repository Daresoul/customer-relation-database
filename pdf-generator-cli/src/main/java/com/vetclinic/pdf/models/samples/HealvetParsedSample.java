package com.vetclinic.pdf.models.samples;

import com.vetclinic.pdf.constants.AnalysisProfile;
import com.vetclinic.pdf.constants.Gender;
import com.vetclinic.pdf.constants.PatientType;
import com.vetclinic.pdf.constants.SampleType;
import com.vetclinic.pdf.constants.parameters.HealvetParameterEnum;
import com.vetclinic.pdf.models.parameters.HealvetParameter;

import java.util.logging.Logger;

/**
 *
 * HealvetParsedSample is used when parsing the actual data received from
 * the device... for other devices we use the same Sample class for both parsed
 * samples and displaying samples to the actual report. For Healvet case
 * since each parameter is in its different sample in the device
 * with different sample id and other parameters, we are parsing it in this
 * object, and when we select the wanted samples to display in the report
 * we will only then the one HealvetSample with all needed parameters. This way
 * we won't be messing with the object itself.
 */
public class HealvetParsedSample {

    private String patientId;
    private AnalysisProfile analysisProfile;
    private String analysisDateAndTime;
    private String sampleId;
    private HealvetParameter healvetParameter;
    private Gender gender;
    private SampleType sampleType;
    private Logger logger = Logger.getLogger(HealvetParsedSample.class.getName());

    public HealvetParsedSample() {

    }

    public String getPatientId() {
        return patientId;
    }

    public void setPatientId(String patientId) {
        this.patientId = patientId;
    }

    public AnalysisProfile getAnalysisProfile() {
        return analysisProfile;
    }

    public void setAnalysisProfile(AnalysisProfile analysisProfile, Boolean isBeforeACTHTest) {

        if (this.analysisProfile == null) {
            logger.info("Normal first time parsing ... just set the actual analysis profile");
            this.analysisProfile = analysisProfile;

        } else {
            this.analysisProfile = analysisProfile;

            logger.info("Patient type in the UI has been changed hence the actual referent ranges have to be changed" +
                    " as well ... i.e. the HealvetParameterEnum");

            HealvetParameterEnum prevHealvetParameterEnum = this.healvetParameter.getHealvetParameterEnum();
            PatientType patientType = PatientType.getPatientTypeForCode(analysisProfile.getProfileCode());

            HealvetParameterEnum updatedHealvetParameterEnum =
                    HealvetParameterEnum.getParameterByProperties(prevHealvetParameterEnum.getCode(), patientType,
                            isBeforeACTHTest);

            logger.info("Updated Healvet Parameter Enum: " + updatedHealvetParameterEnum);
            if (updatedHealvetParameterEnum != null) {
                this.healvetParameter.setHealvetParameterEnum(updatedHealvetParameterEnum);
            }
        }
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

    public HealvetParameter getHealvetParameter() {
        return healvetParameter;
    }

    public void setHealvetParameter(HealvetParameter healvetParameter) {
        this.healvetParameter = healvetParameter;
    }

    public Gender getGender() {
        return gender;
    }

    public void setGender(Gender gender) {
        this.gender = gender;
    }

    public SampleType getSampleType() {
        return sampleType;
    }

    public void setSampleType(SampleType sampleType) {
        this.sampleType = sampleType;
    }

    @Override
    public String toString() {
        return "HealvetParsedSample{" +
                "patientId='" + patientId + '\'' +
                ", analysisProfile=" + analysisProfile +
                ", analysisDateAndTime='" + analysisDateAndTime + '\'' +
                ", sampleId='" + sampleId + '\'' +
                ", healvetParameter=" + healvetParameter +
                ", gender=" + gender +
                ", sampleType=" + sampleType +
                '}';
    }

//    @Override
//    public boolean equals(Object obj) {
//
//        if (obj instanceof HealvetParsedSample) {
//            HealvetParsedSample healvetParsedSample = (HealvetParsedSample) obj;
//            System.out.println("EQUALS HEALVET PARSED SAMPLE");
//            return this.sampleId != null && this.sampleId.equals(healvetParsedSample.getSampleId()) &&
//                    this.patientId != null && this.patientId.equals(healvetParsedSample.getPatientId()) &&
//                    this.analysisDateAndTime != null && this.analysisDateAndTime.equals(healvetParsedSample.getAnalysisDateAndTime()) &&
//                    this.getHealvetParameter() != healvetParsedSample.getHealvetParameter() &&
//                    this.getSampleType() != healvetParsedSample.getSampleType();
//        }
//
//        return false;
//    }
}
