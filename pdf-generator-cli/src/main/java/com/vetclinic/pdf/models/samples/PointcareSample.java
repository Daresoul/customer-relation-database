package com.vetclinic.pdf.models.samples;

import com.vetclinic.pdf.constants.Gender;
import com.vetclinic.pdf.constants.PointcareTestType;
import com.vetclinic.pdf.constants.SampleType;

public class PointcareSample extends Sample {

    private SampleType sampleType;
    private Gender gender; // will be ignored in report
    private PointcareTestType testType;

    public SampleType getSampleType() {
        return sampleType;
    }

    public void setSampleType(SampleType sampleType) {
        this.sampleType = sampleType;
    }

    public Gender getGender() {
        return gender;
    }

    public void setGender(Gender gender) {
        this.gender = gender;
    }

    public PointcareTestType getTestType() {
        return testType;
    }

    public void setTestType(PointcareTestType testType) {
        this.testType = testType;
    }
}
