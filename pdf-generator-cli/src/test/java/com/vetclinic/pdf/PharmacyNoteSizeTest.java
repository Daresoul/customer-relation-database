package com.vetclinic.pdf;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.io.File;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every record with a prescription stores a pharmacy note, and every backup
 * copies it. The template's letterhead image used to be stored uncompressed,
 * so each note was ~23 MB.
 */
class PharmacyNoteSizeTest {

    @Test
    void aPharmacyNoteIsSmall() throws Exception {
        JsonObject in = new JsonObject();
        in.addProperty("report_type", "pharmacy_note");
        in.addProperty("prescription_text", "Амоксицилин 250 мг, 2× дневно, 7 дена.");
        File pdf = InvoiceRenderTest.renderToFile(in);
        assertTrue(pdf.length() < 1_000_000, "pharmacy note is " + pdf.length() + " bytes");
    }
}
