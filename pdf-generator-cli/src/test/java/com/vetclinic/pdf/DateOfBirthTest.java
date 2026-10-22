package com.vetclinic.pdf;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

class DateOfBirthTest {

    private static JsonObject withDob(String dob) {
        JsonObject p = patient("REX", "Dog", "Male");
        p.addProperty("date_of_birth", dob);
        return p;
    }

    @Test
    void isoDateFromRustParses() {
        assertEquals(LocalDate.of(2020, 1, 15), PdfGeneratorCLI.parsePatient(withDob("2020-01-15")).getDateOfBirth());
    }

    @Test
    void legacySlashDateStillParses() {
        assertEquals(LocalDate.of(2020, 1, 15), PdfGeneratorCLI.parsePatient(withDob("15/01/2020")).getDateOfBirth());
    }

    @Test
    void garbageDateIsUnknown() {
        assertNull(PdfGeneratorCLI.parsePatient(withDob("not a date")).getDateOfBirth());
    }

    @Test
    void dateOfBirthPrintsOnGridReport() throws Exception {
        String text = render(deviceInput(withDob("2020-01-15"), sample("exigo_eos_vet", DeviceReportRenderTest.exigo())));
        assertTrue(text.contains("Датум на раѓање: 15/01/2020"), text);
    }

    @Test
    void ageIsYearsOrMonthsOrDash() {
        LocalDate today = LocalDate.of(2026, 10, 22);
        assertEquals("6 години", Util.formatAge(LocalDate.of(2020, 1, 15), today));
        assertEquals("1 година", Util.formatAge(LocalDate.of(2025, 10, 22), today));
        assertEquals("7 месеци", Util.formatAge(LocalDate.of(2026, 3, 1), today));
        assertEquals("1 месец", Util.formatAge(LocalDate.of(2026, 9, 20), today));
        assertEquals("—", Util.formatAge(null, today));
    }

    @Test
    void pcrReportShowsRealAgeNotZero() throws Exception {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("IC", "32.03");
        LocalDate dob = LocalDate.now().minusYears(3).minusDays(2);
        String text = render(deviceInput(withDob(dob.toString()), sample("pcr", r)));
        assertTrue(text.contains("Возраст:3 години"), text);
    }

    @Test
    void pcrReportWithoutBirthDateShowsDash() throws Exception {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("IC", "32.03");
        String text = render(deviceInput(patient("REX", "Dog", "Male"), sample("pcr", r)));
        assertTrue(text.contains("Возраст:—"), text);
    }
}
