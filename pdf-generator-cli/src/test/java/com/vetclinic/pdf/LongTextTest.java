package com.vetclinic.pdf;

import com.google.gson.JsonObject;
import com.itextpdf.text.pdf.PdfReader;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Files;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Final review: text longer than one page was dropped from the medical report
 * and the pharmacy note without a warning (an 80-line description printed 24).
 */
class LongTextTest {

    private static String lines(String prefix, int count) {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= count; i++) {
            sb.append(prefix).append(' ').append(i).append('\n');
        }
        return sb.toString();
    }

    private static int pages(File pdf) throws Exception {
        PdfReader reader = new PdfReader(Files.readAllBytes(pdf.toPath()));
        int n = reader.getNumberOfPages();
        reader.close();
        return n;
    }

    @Test
    void aLongReportWithPatientContinuesOnAnotherPage() throws Exception {
        JsonObject in = RecordDocumentsTest.report(true);
        in.addProperty("description", lines("Наод ред", 80));
        File pdf = InvoiceRenderTest.renderToFile(in);
        String text = InvoiceRenderTest.text(pdf);
        assertTrue(text.contains("Наод ред 80"), text);
        assertTrue(pages(pdf) >= 2);
    }

    @Test
    void aLongReportWithoutPatientContinuesOnAnotherPage() throws Exception {
        JsonObject in = RecordDocumentsTest.report(false);
        in.addProperty("description", lines("Наод ред", 80));
        File pdf = InvoiceRenderTest.renderToFile(in);
        assertTrue(InvoiceRenderTest.text(pdf).contains("Наод ред 80"));
        assertTrue(pages(pdf) >= 2);
    }

    @Test
    void aLongPrescriptionContinuesOnAnotherPage() throws Exception {
        JsonObject in = ClinicLetterheadTest.pharmacyNote();
        in.addProperty("prescription_text", lines("Лек", 60));
        File pdf = InvoiceRenderTest.renderToFile(in);
        assertTrue(InvoiceRenderTest.text(pdf).contains("Лек 60"));
        assertTrue(pages(pdf) >= 2);
    }

    // Final review (low): a title past about 70 characters was cut off.
    @Test
    void aLongTitleIsPrintedWhole() throws Exception {
        String title = "Контролен преглед по операција на левата задна нога со промена на завој и проверка на шевовите и раната крајзбор";
        for (boolean withPatient : new boolean[] {true, false}) {
            JsonObject in = RecordDocumentsTest.report(withPatient);
            in.addProperty("title", title);
            String text = RecordDocumentsTest.flat(InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(in)));
            assertTrue(text.contains("крајзбор"), (withPatient ? "with patient: " : "without patient: ") + text);
            assertTrue(text.contains("Здрав."), "description still printed: " + text);
        }
    }

    @Test
    void aShortReportStaysOnOnePage() throws Exception {
        assertTrue(pages(InvoiceRenderTest.renderToFile(RecordDocumentsTest.report(true))) == 1);
    }
}
