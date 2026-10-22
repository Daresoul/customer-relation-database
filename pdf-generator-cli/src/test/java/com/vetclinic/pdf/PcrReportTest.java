package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.vetclinic.pdf.constants.PatientType;
import com.vetclinic.pdf.models.parameters.PcrParameter;
import com.vetclinic.pdf.models.samples.PcrSample;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

class PcrReportTest {

    /** Keys the Rust HL7 parser produces from the clinic's real cat capture (real_pcr_com13.bin). */
    static Map<String, String> realCatCapture() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("sending_application", "PointcarePCRV");
        r.put("message_datetime", "20260604112213");
        r.put("message_type", "ORU^R01");
        r.put("hl7_version", "2.3.1");
        r.put("MSH_10", "1");
        r.put("MSH_13", "MV2502001Z020C1231");
        r.put("patient_id_internal", "55");
        r.put("species", "cat");
        r.put("patient_name", "olav");
        r.put("gender_alt", "O");
        r.put("OBR_3", "55");
        r.put("test_datetime", "20260604101801");
        r.put("sample_id", "0C1231-4-0015");
        r.put("TOX", "NoCt");
        r.put("TOX_range", ">36 or NoCt");
        r.put("TOX_flag", "Negative(-)");
        r.put("TOX_sample_type", "Whole blood");
        r.put("TOX_curve", "640#636#636#639#636#640#636#643#639#638#642#641#638#646");
        r.put("TOX_lot", "250350");
        r.put("TOX_threshold", "775.2");
        r.put("IC", "32.03");
        r.put("IC_range", ">36 or NoCt");
        r.put("IC_flag", "Postive(+)");
        r.put("IC_sample_type", "Whole blood");
        r.put("IC_curve", "899#918#920#917#916#914#1200#1600#1900#1943");
        r.put("IC_lot", "250350");
        r.put("IC_threshold", "943.125");
        return r;
    }

    private static PcrSample parse(Map<String, String> results) {
        JsonArray arr = new JsonArray();
        arr.add(sample("pcr", results));
        return (PcrSample) PdfGeneratorCLI.parseSamples(arr, PatientType.CAT).get(0);
    }

    private static List<String> codes(PcrSample s) {
        List<String> out = new ArrayList<>();
        for (PcrParameter p : s.getPcrParameters()) {
            out.add(p.getName());
        }
        return out;
    }

    private static String render(Map<String, String> results) throws Exception {
        JsonObject s = sample("pcr", results);
        return PdfTestSupport.render(deviceInput(patient("OLAV", "Cat", "Male"), s));
    }

    /** The results-table line for one test code. */
    private static String row(String text, String code) {
        for (String line : text.split("\n")) {
            if (line.startsWith(code + " ")) {
                return line;
            }
        }
        fail("no row for " + code + " in:\n" + text);
        return null;
    }

    // --- every code prints ---

    @Test
    void realCatCaptureRendersToxAndInternalControl() {
        assertEquals(java.util.Arrays.asList("TOX", "IC"), codes(parse(realCatCapture())));
    }

    @Test
    void unknownCodePrintsWithItsRawName() throws Exception {
        Map<String, String> r = realCatCapture();
        r.put("XYZ-9", "24.1");
        r.put("XYZ-9_flag", "Postive(+)");
        assertTrue(codes(parse(r)).contains("XYZ-9"));
        assertTrue(row(render(r), "XYZ-9").contains("Positive(+)"));
    }

    @Test
    void positiveToxIsOnTheReport() throws Exception {
        Map<String, String> r = realCatCapture();
        r.put("TOX", "24.10");
        r.put("TOX_flag", "Postive(+)");
        assertTrue(row(render(r), "TOX").contains("Positive(+)"));
    }

    // --- the device's call, the internal control, non-numeric values ---

    @Test
    void deviceCallWinsOverTheFixedCutoff() throws Exception {
        Map<String, String> r = realCatCapture();
        r.put("TOX", "35.5");
        r.put("TOX_range", "> 35 or NoCt");
        r.put("TOX_flag", "Negative(-)");
        assertTrue(row(render(r), "TOX").contains("Negative(-)"));
    }

    @Test
    void withoutADeviceCallTheDeviceRangeIsUsed() {
        Map<String, String> r = realCatCapture();
        r.remove("TOX_flag");
        r.put("TOX", "35.5");
        r.put("TOX_range", "> 35 or NoCt");
        assertFalse(parse(r).getPcrParameters().get(0).isPositive());
        r.put("TOX", "30.0");
        assertTrue(parse(r).getPcrParameters().get(0).isPositive());
    }

    @Test
    void nonNumericValueIsNeverNegative() throws Exception {
        Map<String, String> r = realCatCapture();
        r.remove("TOX_flag");
        r.put("TOX", "Invalid");
        String tox = row(render(r), "TOX");
        assertFalse(tox.contains("Negative(-)"), tox);
        assertFalse(tox.contains("Positive(+)"), tox);
        assertTrue(tox.contains("Invalid"), tox);
    }

    @Test
    void failedInternalControlMakesThePanelInvalid() throws Exception {
        Map<String, String> r = realCatCapture();
        r.put("IC", "NoCt");
        r.put("IC_flag", "Negative(-)");
        String text = render(r);
        assertTrue(text.contains("НЕВАЛИДЕН ТЕСТ"), text);
        String tox = row(text, "TOX");
        assertFalse(tox.contains("Negative(-)"), tox);
        assertTrue(tox.contains("INVALID"), tox);
    }

    @Test
    void passingInternalControlReadsValidNotPositive() throws Exception {
        String text = render(realCatCapture());
        assertFalse(text.contains("НЕВАЛИДЕН ТЕСТ"), text);
        String ic = row(text, "IC");
        assertTrue(ic.contains("Valid"), ic);
        assertFalse(ic.contains("Positive(+)"), ic);
    }

    // --- the curve ---

    @Test
    void deviceThresholdIsCarriedToTheCurve() {
        PcrSample s = parse(realCatCapture());
        assertEquals(775.2, s.getPcrParameters().get(0).getThreshold(), 1e-9);
    }

    @Test
    void curveRendersWithMissingOrFlatData() throws Exception {
        Map<String, String> r = realCatCapture();
        r.put("TOX_curve", "640");
        r.remove("IC_curve");
        render(r);
    }
}
