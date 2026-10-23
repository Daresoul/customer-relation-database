package com.vetclinic.pdf;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * The PDFs are Macedonian. Species and sex came out as "Dog" / "Male" on the
 * record report and "DOG" on the PCR report, and any species but a cat was
 * printed as "куче" on lab reports.
 */
class SpeciesOnPdfTest {

    @Test
    void theRecordReportNamesSpeciesAndSexInMacedonian() throws Exception {
        JsonObject in = ClinicLetterheadTest.report();
        in.add("patient", patient("REX", "Dog", "Male"));
        String text = InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(in));
        assertTrue(text.contains("Куче"), text);
        assertTrue(text.contains("мажјак"), text);
        assertFalse(text.contains("Dog"), text);
        assertFalse(text.contains("Male"), text);
    }

    @Test
    void aHamstersLabReportSaysHamster() throws Exception {
        String text = render(deviceInput(patient("BUBI", "Hamster", "Female"), sample("exigo_eos_vet", DeviceReportRenderTest.exigo())));
        assertTrue(text.contains("Хрчак"), text);
        assertFalse(text.toLowerCase().contains("куче"), text);
    }

    @Test
    void thePcrReportNamesTheSpeciesInMacedonian() throws Exception {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("IC", "32.03");
        String text = render(deviceInput(patient("REX", "Dog", "Male"), sample("pcr", r)));
        assertTrue(text.contains("Куче"), text);
        assertFalse(text.contains("DOG"), text);
    }

    @Test
    void aSpeciesTheClinicAddedKeepsItsName() throws Exception {
        String text = render(deviceInput(patient("ЗМЕЈ", "Игуана", "Male"), sample("exigo_eos_vet", DeviceReportRenderTest.exigo())));
        assertTrue(text.contains("Игуана"), text);
    }
}
