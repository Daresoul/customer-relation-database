package com.vetclinic.pdf;

import com.google.gson.JsonObject;
import com.itextpdf.text.pdf.PdfDictionary;
import com.itextpdf.text.pdf.PdfName;
import com.itextpdf.text.pdf.PdfObject;
import com.itextpdf.text.pdf.PdfReader;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import javax.imageio.ImageIO;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClinicLetterheadTest {

    static JsonObject clinic() {
        JsonObject c = new JsonObject();
        c.addProperty("name", "Д-р Ана Тестовска");
        c.addProperty("address", "Партизанска 5");
        c.addProperty("city", "7000 Битола");
        c.addProperty("phone", "047 111 222");
        c.addProperty("email", "ana@vet.mk");
        c.addProperty("tax_number", "4002999111222");
        c.addProperty("registration_number", "7654321");
        c.addProperty("bank_account", "300000000012345");
        c.addProperty("bank_name", "Комерцијална Банка");
        return c;
    }

    static JsonObject report() {
        JsonObject in = new JsonObject();
        in.addProperty("report_type", "simple");
        in.addProperty("title", "Преглед");
        in.addProperty("description", "Здрав.");
        in.add("patient", patient("REX", "Dog", "Male"));
        return in;
    }

    static JsonObject pharmacyNote() {
        JsonObject in = new JsonObject();
        in.addProperty("report_type", "pharmacy_note");
        in.addProperty("prescription_text", "Amoxicillin 250 mg");
        return in;
    }

    static String flat(String text) {
        return text.replaceAll("\\s+", " ");
    }

    static File logoPng() throws Exception {
        BufferedImage img = new BufferedImage(40, 40, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = img.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, 40, 40);
        g.dispose();
        File f = File.createTempFile("logo-", ".png");
        f.deleteOnExit();
        ImageIO.write(img, "png", f);
        return f;
    }

    static int imagesOnFirstPage(File pdf) throws Exception {
        PdfReader reader = new PdfReader(Files.readAllBytes(pdf.toPath()));
        int count = countImages(reader.getPageN(1).getAsDict(PdfName.RESOURCES), 0);
        reader.close();
        return count;
    }

    private static int countImages(PdfDictionary resources, int depth) {
        if (resources == null || depth > 4) return 0;
        PdfDictionary xobjects = resources.getAsDict(PdfName.XOBJECT);
        if (xobjects == null) return 0;
        int count = 0;
        for (PdfName key : xobjects.getKeys()) {
            PdfObject obj = PdfReader.getPdfObject(xobjects.get(key));
            if (!(obj instanceof PdfDictionary)) continue;
            PdfDictionary x = (PdfDictionary) obj;
            if (PdfName.IMAGE.equals(x.getAsName(PdfName.SUBTYPE))) count++;
            else count += countImages(x.getAsDict(PdfName.RESOURCES), depth + 1);
        }
        return count;
    }

    static File renderFile(JsonObject input) throws Exception {
        File out = File.createTempFile("letterhead-", ".pdf");
        out.deleteOnExit();
        input.addProperty("output_path", out.getAbsolutePath());
        PdfGeneratorCLI.generate(input);
        return out;
    }

    @Test
    void theReportShowsTheClinicProfile() throws Exception {
        JsonObject in = report();
        in.add("clinic", clinic());
        String text = flat(render(in));
        assertTrue(text.contains("Д-р Ана Тестовска"), text);
        assertTrue(text.contains("Партизанска 5, 7000 Битола"), text);
        assertTrue(text.contains("047 111 222"), text);
        assertTrue(text.contains("ana@vet.mk"), text);
    }

    @Test
    void aBlankProfileLeavesTheReportAsItWas() throws Exception {
        String before = render(report());
        JsonObject in = report();
        in.add("clinic", new JsonObject());
        assertEquals(before, render(in));
        assertFalse(before.contains("Партизанска"));
    }

    @Test
    void anEmptyFieldFallsBackToTheBakedText() throws Exception {
        JsonObject c = new JsonObject();
        c.addProperty("phone", "047 111 222");
        JsonObject in = report();
        in.add("clinic", c);
        String text = flat(render(in));
        assertTrue(text.contains("047 111 222"), text);
        assertTrue(text.contains("Васко Карангелески"), text);
    }

    @Test
    void theInvoiceShowsTheBankAccountAndTaxNumbers() throws Exception {
        JsonObject in = InvoiceRenderTest.invoice(2, 0);
        in.add("clinic", clinic());
        String text = flat(InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(in)));
        assertTrue(text.contains("300000000012345"), text);
        assertTrue(text.contains("Комерцијална Банка"), text);
        assertTrue(text.contains("4002999111222"), text);
        assertTrue(text.contains("ЕМБС: 7654321"), text);
        assertTrue(text.contains("Партизанска 5, 7000 Битола"), text);
    }

    @Test
    void anInvoiceWithoutAProfileHasNoRegistrationNumberLine() throws Exception {
        String text = InvoiceRenderTest.text(InvoiceRenderTest.renderToFile(InvoiceRenderTest.invoice(2, 0)));
        assertFalse(text.contains("ЕМБС"), text);
    }

    @Test
    void thePharmacyNoteShowsTheClinicContact() throws Exception {
        JsonObject in = pharmacyNote();
        in.add("clinic", clinic());
        String text = flat(render(in));
        assertTrue(text.contains("Партизанска 5 - 7000 Битола"), text);
        assertTrue(text.contains("047 111 222"), text);
        assertTrue(text.contains("ana@vet.mk"), text);
        assertTrue(text.contains("Д-р Ана Тестовска"), text);
    }

    @Test
    void theLabReportHeaderShowsTheClinicProfile() throws Exception {
        JsonObject in = deviceInput(patient("BLEKI", "Dog", "Male"),
                sample("exigo_eos_vet", DeviceReportRenderTest.exigo()));
        in.add("clinic", clinic());
        String text = flat(render(in));
        assertTrue(text.contains("Д-р Ана Тестовска"), text);
        assertTrue(text.contains("Партизанска 5"), text);
        assertTrue(text.contains("7000 Битола"), text);
        assertTrue(text.contains("047 111 222"), text);
        assertTrue(text.contains("ana@vet.mk"), text);
    }

    @Test
    void aLabReportWithoutAProfileKeepsTheBuiltInHeader() throws Exception {
        String text = render(deviceInput(patient("BLEKI", "Dog", "Male"),
                sample("exigo_eos_vet", DeviceReportRenderTest.exigo())));
        assertTrue(text.contains("Д-р Марин Величковски"), text);
    }

    @Test
    void aLogoIsDrawnOnEveryLetterhead() throws Exception {
        String logo = logoPng().getAbsolutePath();
        JsonObject[] inputs = {
                report(),
                pharmacyNote(),
                InvoiceRenderTest.invoice(2, 0),
                deviceInput(patient("BLEKI", "Dog", "Male"), sample("exigo_eos_vet", DeviceReportRenderTest.exigo())),
        };
        for (JsonObject plain : inputs) {
            int before = imagesOnFirstPage(renderFile(plain.deepCopy()));
            JsonObject withLogo = plain.deepCopy();
            JsonObject c = new JsonObject();
            c.addProperty("logo_path", logo);
            withLogo.add("clinic", c);
            int after = imagesOnFirstPage(renderFile(withLogo));
            assertTrue(after > before, plain.get("report_type") + ": " + before + " -> " + after);
        }
    }

    @Test
    void aMissingLogoFileDoesNotStopTheDocument() throws Exception {
        JsonObject in = report();
        JsonObject c = new JsonObject();
        c.addProperty("logo_path", "/nonexistent/logo.png");
        in.add("clinic", c);
        assertTrue(render(in).contains("Преглед"));
    }
}
