package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Record documents: the visit's date, line descriptions, Macedonian amounts. */
class RecordDocumentsTest {

    static String flat(String text) {
        return text.replaceAll("\\s+", " ");
    }

    static JsonObject report(boolean withPatient) {
        JsonObject in = withPatient ? ClinicLetterheadTest.report() : new JsonObject();
        in.addProperty("report_type", "simple");
        in.addProperty("title", "Преглед");
        in.addProperty("description", "Здрав.");
        in.addProperty("date", "05/03/2026");
        return in;
    }

    @Test
    void aReportWithPatientPrintsTheRecordsDate() throws Exception {
        String text = InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(report(true)));
        assertTrue(text.contains("05/03/2026"), text);
    }

    @Test
    void aReportWithoutPatientPrintsTheRecordsDate() throws Exception {
        String text = InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(report(false)));
        assertTrue(text.contains("05/03/2026"), text);
    }

    static JsonObject invoiceWith(String name, String description, double price) {
        JsonObject in = InvoiceRenderTest.invoice(0, 0);
        JsonArray arr = new JsonArray();
        JsonObject item = new JsonObject();
        item.addProperty("name", name);
        if (description != null) item.addProperty("description", description);
        item.addProperty("quantity", 1);
        item.addProperty("unit_price", price);
        arr.add(item);
        in.add("line_items", arr);
        return in;
    }

    @Test
    void anInvoiceLinePrintsItsDescriptionUnderTheName() throws Exception {
        String text = flat(InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(
                invoiceWith("Вакцина", "Против беснило, серија 42", 800))));
        assertTrue(text.contains("Вакцина"), text);
        assertTrue(text.contains("Против беснило, серија 42"), text);
        assertTrue(text.indexOf("Вакцина") < text.indexOf("Против беснило"), text);
    }

    @Test
    void amountsUseMacedonianGroupingAndDecimalComma() throws Exception {
        String text = InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(invoiceWith("Операција", null, 12500.5)));
        assertTrue(text.contains("12.500,50"), text);
        assertFalse(text.contains("12500.50"), text);

        String whole = InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(invoiceWith("Операција", null, 1500)));
        assertTrue(whole.contains("1.500 ден"), whole);
    }
}
