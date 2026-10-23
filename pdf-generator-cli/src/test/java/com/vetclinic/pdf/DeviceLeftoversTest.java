package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.vetclinic.pdf.constants.PatientType;
import com.vetclinic.pdf.models.parameters.Parameter;
import com.vetclinic.pdf.models.samples.Sample;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

/** Round-1 device leftovers on the lab report. */
class DeviceLeftoversTest {

    private static List<Parameter> parse(String device, Map<String, String> results) {
        JsonArray arr = new JsonArray();
        arr.add(sample(device, results));
        List<Sample> samples = PdfGeneratorCLI.parseSamples(arr, PatientType.DOG);
        return samples.get(0).getParameters();
    }

    private static List<String> names(List<Parameter> params) {
        List<String> out = new ArrayList<>();
        for (Parameter p : params) {
            out.add(p.getName());
        }
        return out;
    }

    /** The results-table line that starts with {@code start}. */
    private static String row(String text, String start) {
        for (String line : text.split("\n")) {
            if (line.startsWith(start)) {
                return line;
            }
        }
        fail("no row starting with " + start + " in:\n" + text);
        return null;
    }

    // parsers M1: the Healvet table printed the test time and spare fields as results.
    @Test
    void healvetMetadataIsNotPrintedAsAResult() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("sample_id", "03fa024b060426001");
        r.put("test_datetime", "06-04-2026 11:49:53");
        r.put("patient_name", "bubu");
        r.put("sample_type", "Serum Plasma");
        r.put("field_10", "x");
        r.put("field_11", "y");
        r.put("cCRP", "12.5");
        List<String> names = names(parse("healvet", r));
        assertEquals(1, names.size(), names.toString());
        assertFalse(names.contains("test_datetime"), names.toString());
        assertFalse(names.contains("field_10"), names.toString());
    }

    // gaps L8: PointCare ratios came with the device range "0-0", printed as-is.
    @Test
    void pointcareZeroZeroRangeIsNotPrinted() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("A/G", "1.2");
        r.put("A/G_range", "0-0");
        r.put("GLU", "95");
        r.put("GLU_range", "70-142");
        List<Parameter> params = parse("pointcare", r);
        for (Parameter p : params) {
            if (p.getName().equals("A/G")) {
                assertEquals("", p.getReferentValues());
            } else {
                assertEquals("70-142", p.getReferentValues());
            }
        }
    }

    // gaps L7: the PCR sample-type column was always blank.
    @Test
    void pcrSampleTypeIsPrinted() throws Exception {
        String text = render(deviceInput(patient("OLAV", "Cat", "Male"),
                sample("pcr", PcrReportTest.realCatCapture())));
        assertTrue(row(text, "TOX ").contains("Whole blood"), row(text, "TOX "));
    }

    // parsers M6: the sample type the app now sends is printed, not "serum".
    @Test
    void pointcareWholeBloodIsPrinted() throws Exception {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("GLU", "95");
        com.google.gson.JsonObject s = sample("pointcare", r);
        s.addProperty("sample_type", "Whole blood");
        String text = render(deviceInput(patient("REX", "Dog", "Male"), s));
        assertTrue(text.contains("полна крв"), text);
    }

    // device-health #12: a PointCare code without a row only reached a log line.
    @Test
    void pointcareCodesWithoutARowAreNamedInAPdfWarning() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("GLU", "95");
        r.put("XYZ", "1.0");
        r.put("ABC", "2.0");
        r.put("ABC_unit", "U/L");
        r.put("sample_id", "45512");
        PrintStream original = System.err;
        ByteArrayOutputStream captured = new ByteArrayOutputStream();
        System.setErr(new PrintStream(captured, true));
        try {
            parse("pointcare", r);
        } finally {
            System.setErr(original);
        }
        String err = new String(captured.toByteArray(), StandardCharsets.UTF_8);
        assertTrue(err.contains("PDF_WARN code=unmapped_analytes device=pointcare codes=ABC,XYZ"), err);
    }
}
