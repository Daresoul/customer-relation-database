package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.vetclinic.pdf.constants.Indicator;
import com.vetclinic.pdf.constants.PatientType;
import com.vetclinic.pdf.models.parameters.Parameter;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Healvet has reference ranges for dogs and cats only. A rabbit's result was
 * printed against the dog range and flagged by it; it now shows the value
 * with its name and unit, and no range or flag.
 */
class OtherSpeciesRangesTest {

    @Test
    void speciesOtherThanDogOrCatHaveNoRangesOfTheirOwn() {
        assertEquals(PatientType.DOG, PdfGeneratorCLI.parsePatient(patient("REX", "Dog", "Male")).getPatientType());
        assertEquals(PatientType.CAT, PdfGeneratorCLI.parsePatient(patient("MACA", "Cat", "Female")).getPatientType());
        assertEquals(PatientType.OTHER, PdfGeneratorCLI.parsePatient(patient("ZEKO", "Rabbit", "Male")).getPatientType());
        assertEquals(PatientType.OTHER, PdfGeneratorCLI.parsePatient(patient("BUBI", "Hamster", "Female")).getPatientType());
    }

    @Test
    void aRabbitsHealvetValueHasNameAndUnitButNoRangeOrFlag() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("cCRP", "12.5");
        JsonArray arr = new JsonArray();
        arr.add(sample("healvet", r));
        Parameter p = PdfGeneratorCLI.parseSamples(arr, PatientType.OTHER).get(0).getParameters().get(0);
        assertEquals("CRP инфек. маркер", p.getName());
        assertEquals("mg/L", p.getUnit());
        assertEquals("12.5", p.getResult());
        assertTrue(p.getReferentValues() == null || p.getReferentValues().isEmpty(), p.getReferentValues());
        assertEquals(Indicator.UNKNOWN, p.getIndicator());
    }
}
