package com.vetclinic.pdf.models;

import com.vetclinic.pdf.constants.Constants;
import com.vetclinic.pdf.constants.Gender;
import com.vetclinic.pdf.constants.PatientType;

import java.time.LocalDate;

/**
 * Database Model -> Mapping (CLI version - no JavaFX Properties)
 */
public class Patient {

    private int id;
    private String name;
    private PatientType patientType;
    private String owner;
    private String patientIdMicrochip;
    private LocalDate dateOfBirth;
    private Gender gender;

    public Patient() {
        this.id = -1;
        this.name = "";
        this.owner = "";
        this.patientIdMicrochip = Constants.DEFAULT_MICRO_CHIP;
        this.patientType = PatientType.DOG;
        this.dateOfBirth = null;
        this.gender = Gender.MALE;
    }

    public Patient(int id, String name, PatientType patientType, String owner, String patientIdMicrochip,
                   LocalDate dateOfBirth, Gender gender) {
        this.id = id;
        this.name = name;
        this.patientType = patientType;
        this.owner = owner;
        this.patientIdMicrochip = patientIdMicrochip;
        this.dateOfBirth = dateOfBirth;
        this.gender = gender;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public PatientType getPatientType() {
        return patientType;
    }

    public void setPatientType(PatientType patientType) {
        this.patientType = patientType;
    }

    public String getOwner() {
        return owner;
    }

    public void setOwner(String owner) {
        this.owner = owner;
    }

    public String getPatientIdMicrochip() {
        return patientIdMicrochip;
    }

    public void setPatientIdMicrochip(String patientIdMicrochip) {
        this.patientIdMicrochip = patientIdMicrochip;
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public Patient shallowCopy() {
        Patient newPatient = new Patient();
        newPatient.setPatientType(this.getPatientType());
        newPatient.setId(this.getId());
        newPatient.setName(this.getName());
        newPatient.setOwner(this.getOwner());
        newPatient.setPatientIdMicrochip(this.getPatientIdMicrochip());
        newPatient.setGender(this.getGender());
        newPatient.setDateOfBirth(this.getDateOfBirth());
        return newPatient;
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof Patient)) {
            return false;
        }

        Patient otherPatient = (Patient) obj;
        return this.getPatientIdMicrochip().equals(otherPatient.getPatientIdMicrochip()) &&
        this.getName().equals(otherPatient.getName()) &&
        this.getOwner().equals(otherPatient.getOwner()) &&
        this.getPatientType() == otherPatient.getPatientType();
    }

    public LocalDate getDateOfBirth() {
        return dateOfBirth;
    }

    public void setDateOfBirth(LocalDate dateOfBirth) {
        this.dateOfBirth = dateOfBirth;
    }

    public Gender getGender() {
        return gender;
    }

    public void setGender(Gender gender) {
        this.gender = gender;
    }

    @Override
    public String toString() {
        return "Patient{" +
                "id=" + id +
                ", name='" + name + '\'' +
                ", patientType=" + patientType +
                ", owner='" + owner + '\'' +
                ", patientIdMicrochip='" + patientIdMicrochip + '\'' +
                ", dateOfBirth=" + dateOfBirth +
                ", gender=" + gender +
                '}';
    }
}
