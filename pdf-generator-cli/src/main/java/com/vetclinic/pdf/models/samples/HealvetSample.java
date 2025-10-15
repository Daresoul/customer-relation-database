package com.vetclinic.pdf.models.samples;

import com.vetclinic.pdf.constants.Gender;
import com.vetclinic.pdf.constants.SampleType;
import com.vetclinic.pdf.constants.parameters.HealvetParameterEnum;

public class HealvetSample extends Sample {

    private SampleType sampleType;
    private Gender gender; // will be ignored in report
    // when parsing Healvet Samples, we are creating one Sample per parameter since this is how
    // the device sends it to us ... this way we will have an instance of a HealvetParameter here
    // which will be mainly used to twist the before/after ACTH test ranges in the actual Parameter
    // from the Sample Parent class ...
    private HealvetParameterEnum healvetParameterEnum;

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

    public HealvetParameterEnum getHealvetParameterEnum() {
        return healvetParameterEnum;
    }

    public void setHealvetParameterEnum(HealvetParameterEnum healvetParameterEnum) {
        this.healvetParameterEnum = healvetParameterEnum;
    }

    @Override
    public String toString() {
        return "HealvetSample{" +
                "sampleType=" + sampleType +
                ", gender=" + gender +
                '}' + super.toString();
    }
}
