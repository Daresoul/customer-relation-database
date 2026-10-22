package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.itextpdf.text.pdf.PdfDictionary;
import com.itextpdf.text.pdf.PdfName;
import com.itextpdf.text.pdf.PdfReader;
import com.itextpdf.text.pdf.parser.ContentByteUtils;
import com.itextpdf.text.pdf.parser.ContentOperator;
import com.itextpdf.text.pdf.parser.PdfContentStreamProcessor;
import com.itextpdf.text.pdf.parser.SimpleTextExtractionStrategy;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InvoiceRenderTest {

    static final String LONG_NAME =
            "Ултразвук на абдомен со доплер и писмен опис на наодот за сопственикот";

    static JsonObject invoice(int items, double discountPercent) {
        JsonObject in = new JsonObject();
        in.addProperty("report_type", "invoice");
        in.addProperty("date", "20/10/2026");
        in.addProperty("invoice_number", "042/2026");
        in.addProperty("recipient", "Петар Петровски");
        in.addProperty("discount_percent", discountPercent);
        in.addProperty("currency", "ден");
        JsonArray arr = new JsonArray();
        for (int i = 1; i <= items; i++) {
            JsonObject item = new JsonObject();
            item.addProperty("name", i == 3 ? LONG_NAME : "Услуга " + i);
            item.addProperty("quantity", 1);
            item.addProperty("unit_price", 100);
            arr.add(item);
        }
        in.add("line_items", arr);
        return in;
    }

    static File renderToFile(JsonObject input) throws Exception {
        File out = File.createTempFile("invoice-test-", ".pdf");
        out.deleteOnExit();
        input.addProperty("output_path", out.getAbsolutePath());
        PdfGeneratorCLI.generate(input);
        return out;
    }

    /**
     * The invoice template's own content stream closes one graphics state
     * more than it opens, which the stock extractor refuses. Text order is
     * all these tests need, so save/restore are ignored.
     */
    static String text(File pdf) throws Exception {
        PdfReader reader = new PdfReader(Files.readAllBytes(pdf.toPath()));
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= reader.getNumberOfPages(); i++) {
            SimpleTextExtractionStrategy strategy = new SimpleTextExtractionStrategy();
            PdfContentStreamProcessor processor = new PdfContentStreamProcessor(strategy);
            ContentOperator ignore = (p, operator, operands) -> { };
            processor.registerContentOperator("q", ignore);
            processor.registerContentOperator("Q", ignore);
            PdfDictionary page = reader.getPageN(i);
            processor.processContent(
                    ContentByteUtils.getContentBytesForPage(reader, i),
                    page.getAsDict(PdfName.RESOURCES));
            sb.append(strategy.getResultantText()).append('\n');
        }
        reader.close();
        return sb.toString();
    }

    static int pages(File pdf) throws Exception {
        PdfReader reader = new PdfReader(Files.readAllBytes(pdf.toPath()));
        int n = reader.getNumberOfPages();
        reader.close();
        return n;
    }

    @Test
    void fortyItemsContinueOnASecondPageAndKeepTheTotals() throws Exception {
        File pdf = renderToFile(invoice(40, 10));
        String text = text(pdf);

        assertTrue(pages(pdf) >= 2, "expected a continuation page");
        assertTrue(text.contains("Услуга 40"), text);
        assertTrue(text.contains("Вкупно"), text);
        assertTrue(text.contains("4000 ден"), text);
        assertTrue(text.contains("За наплата"), text);
        assertTrue(text.contains("3600 ден"), text);
    }

    @Test
    void theHeaderIsRepeatedOnTheContinuationPage() throws Exception {
        File pdf = renderToFile(invoice(40, 0));
        String text = text(pdf);
        int first = text.indexOf("ЕД. ЦЕНА");
        assertTrue(first >= 0 && text.indexOf("ЕД. ЦЕНА", first + 1) > first, text);
    }

    @Test
    void aLongItemNameWrapsInsteadOfBeingCut() throws Exception {
        String text = text(renderToFile(invoice(5, 0))).replaceAll("\\s+", " ");
        assertTrue(text.contains("за сопственикот"), text);
    }

    @Test
    void aShortInvoiceStaysOnOnePage() throws Exception {
        File pdf = renderToFile(invoice(5, 0));
        assertEquals(1, pages(pdf));
        assertTrue(text(pdf).contains("500 ден"));
    }
}
