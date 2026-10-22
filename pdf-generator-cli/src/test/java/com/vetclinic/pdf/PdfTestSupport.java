package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.itextpdf.text.pdf.PdfReader;
import com.itextpdf.text.pdf.parser.PdfTextExtractor;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Map;

/** Builds CLI input JSON and reads rendered PDFs back as text. */
final class PdfTestSupport {

    private PdfTestSupport() {
    }

    static JsonObject patient(String name, String species, String gender) {
        JsonObject p = new JsonObject();
        p.addProperty("name", name);
        p.addProperty("owner", "Owner");
        p.addProperty("species", species);
        p.addProperty("gender", gender);
        return p;
    }

    static JsonObject sample(String deviceType, Map<String, String> results) {
        JsonObject s = new JsonObject();
        s.addProperty("device_type", deviceType);
        s.addProperty("sample_id", "S-1");
        s.addProperty("patient_id", "P-1");
        s.addProperty("detected_at", "2026-07-10T12:52:11Z");
        JsonObject r = new JsonObject();
        for (Map.Entry<String, String> e : results.entrySet()) {
            r.addProperty(e.getKey(), e.getValue());
        }
        s.add("test_results", r);
        return s;
    }

    static JsonObject deviceInput(JsonObject patient, JsonObject... samples) {
        JsonObject in = new JsonObject();
        in.add("patient", patient);
        JsonArray arr = new JsonArray();
        for (JsonObject s : samples) {
            arr.add(s);
        }
        in.add("samples", arr);
        return in;
    }

    /** Renders the input through the CLI entry point and returns the PDF's text. */
    static String render(JsonObject input) throws Exception {
        File out = File.createTempFile("pdf-test-", ".pdf");
        out.deleteOnExit();
        input.addProperty("output_path", out.getAbsolutePath());
        PdfGeneratorCLI.generate(input);
        return text(out);
    }

    static String text(File pdf) throws IOException {
        PdfReader reader = new PdfReader(Files.readAllBytes(pdf.toPath()));
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= reader.getNumberOfPages(); i++) {
            sb.append(PdfTextExtractor.getTextFromPage(reader, i)).append('\n');
        }
        reader.close();
        return sb.toString();
    }
}
