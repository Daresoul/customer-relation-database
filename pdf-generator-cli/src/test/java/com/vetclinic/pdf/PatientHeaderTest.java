package com.vetclinic.pdf;

import com.google.gson.JsonObject;
import com.vetclinic.pdf.constants.Gender;
import com.vetclinic.pdf.constants.Constants;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

class PatientHeaderTest {

    private static Gender genderOf(String raw) {
        return PdfGeneratorCLI.parsePatient(patient("X", "Dog", raw)).getGender();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Female", "FEMALE", "female", "F", "f", "Ж", "ж", "Женка", "женско"})
    void femaleSpellingsAreFemale(String raw) {
        assertEquals("женка", genderOf(raw).getGenderTranslated());
    }

    @ParameterizedTest
    @ValueSource(strings = {"Male", "MALE", "male", "M", "М", "м", "Мажјак", "машко"})
    void maleSpellingsAreMale(String raw) {
        assertEquals("мажјак", genderOf(raw).getGenderTranslated());
    }

    @ParameterizedTest
    @ValueSource(strings = {"Unknown", "", "O", "U", "neutered"})
    void anythingElseIsUnknownNotMale(String raw) {
        assertEquals("непознат", genderOf(raw).getGenderTranslated());
    }

    @Test
    void missingGenderIsUnknown() {
        JsonObject p = patient("X", "Dog", "Male");
        p.remove("gender");
        assertEquals("непознат", PdfGeneratorCLI.parsePatient(p).getGender().getGenderTranslated());
    }

    @Test
    void femaleAnimalPrintsFemaleOnReport() throws Exception {
        String text = render(deviceInput(patient("NINA", "Cat", "Female"),
                sample("exigo_eos_vet", DeviceReportRenderTest.exigo())));
        assertTrue(text.contains("женка"), text);
        assertFalse(text.contains("мажјак"), text);
    }

    @Test
    void chiplessPatientGetsNoInventedChipNumber() throws Exception {
        JsonObject p = patient("NINA", "Dog", "Female");
        p.add("microchip_id", com.google.gson.JsonNull.INSTANCE);
        assertEquals("", PdfGeneratorCLI.parsePatient(p).getPatientIdMicrochip());

        String text = render(deviceInput(p, sample("exigo_eos_vet", DeviceReportRenderTest.exigo())));
        assertFalse(text.contains(Constants.DEFAULT_MICRO_CHIP), text);
        assertTrue(text.contains("Микрочип: —"), text);
    }

    @Test
    void realChipIsPrinted() throws Exception {
        JsonObject p = patient("NINA", "Dog", "Female");
        p.addProperty("microchip_id", "807098100012345");
        String text = render(deviceInput(p, sample("exigo_eos_vet", DeviceReportRenderTest.exigo())));
        assertTrue(text.contains("807098100012345"), text);
    }
}
