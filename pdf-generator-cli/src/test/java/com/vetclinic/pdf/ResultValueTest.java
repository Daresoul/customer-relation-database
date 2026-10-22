package com.vetclinic.pdf;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.vetclinic.pdf.constants.Indicator;
import com.vetclinic.pdf.constants.PatientType;
import com.vetclinic.pdf.models.parameters.Parameter;
import com.vetclinic.pdf.models.samples.Sample;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

/** Odd analyzer values never crash the JAR and never get a made-up colour. */
class ResultValueTest {

    private static Map<String, Parameter> parse(String device, Map<String, String> results) {
        JsonArray arr = new JsonArray();
        arr.add(sample(device, results));
        List<Sample> samples = PdfGeneratorCLI.parseSamples(arr, PatientType.DOG);
        Map<String, Parameter> byResult = new LinkedHashMap<>();
        for (Parameter p : samples.get(0).getParameters()) {
            byResult.put(p.getName(), p);
        }
        return byResult;
    }

    private static Indicator exigoIndicator(String value, String low, String high) {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("WBC", value);
        r.put("WBC_L", low);
        r.put("WBC_H", high);
        return parse("exigo_eos_vet", r).get("WBC - леукоцити").getIndicator();
    }

    @Test
    void exigoDecimalCommaIsANumber() {
        assertEquals(Indicator.HIGH, exigoIndicator("25,4", "6.0", "17.0"));
        assertEquals(Indicator.NORMAL, exigoIndicator("10,4", "6.0", "17.0"));
    }

    @Test
    void exigoGreaterLessThanCompareAgainstTheRange() {
        assertEquals(Indicator.HIGH, exigoIndicator(">25.0", "6.0", "17.0"));
        assertEquals(Indicator.LOW, exigoIndicator("<0.5", "6.0", "17.0"));
        // ">10" may be inside or above 6-17: no colour rather than a guess.
        assertEquals(Indicator.UNKNOWN, exigoIndicator(">10", "6.0", "17.0"));
    }

    @Test
    void exigoNonNumericValuesGetNoColour() {
        for (String odd : new String[]{"----", "---", "****", "", "N/A"}) {
            assertEquals(Indicator.UNKNOWN, exigoIndicator(odd, "6.0", "17.0"), "value '" + odd + "'");
        }
    }

    @Test
    void exigoDeviceHighLowFlagWins() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("WBC", "10.0");
        r.put("WBC_L", "6.0");
        r.put("WBC_H", "17.0");
        r.put("WBC_F", "H");
        assertEquals(Indicator.HIGH, parse("exigo_eos_vet", r).get("WBC - леукоцити").getIndicator());
    }

    @Test
    void exigoUnknownDeviceFlagIsIgnored() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("WBC", "10.0");
        r.put("WBC_L", "6.0");
        r.put("WBC_H", "17.0");
        r.put("WBC_F", "ER");
        assertEquals(Indicator.NORMAL, parse("exigo_eos_vet", r).get("WBC - леукоцити").getIndicator());
    }

    private static Parameter healvet(String value) {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("cCRP", value);
        return parse("healvet", r).values().iterator().next();
    }

    @Test
    void healvetOddValuesNeverThrow() {
        assertEquals(Indicator.UNKNOWN, healvet("----").getIndicator());
        assertEquals("----", healvet("----").getResult());
        assertEquals(Indicator.UNKNOWN, healvet("N/A").getIndicator());
        assertEquals(Indicator.HIGH, healvet("12,5").getIndicator());
        assertEquals(Indicator.HIGH, healvet(">25.0").getIndicator());
        assertEquals(Indicator.NORMAL, healvet("4.2").getIndicator());
    }

    @Test
    void healvetUnknownCodeGetsNoColour() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("CPSE", "43.51");
        assertEquals(Indicator.UNKNOWN, parse("healvet", r).get("CPSE").getIndicator());
    }

    private static Indicator pointcare(String value, String flag) {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("GLU", value);
        r.put("GLU_range", "70-142");
        if (flag != null) {
            r.put("GLU_flag", flag);
        }
        return parse("pointcare", r).get("GLU - гликоза").getIndicator();
    }

    @Test
    void pointcareValuesAreClassifiedLikeTheOthers() {
        assertEquals(Indicator.LOW, pointcare("12,5", null));
        assertEquals(Indicator.UNKNOWN, pointcare("---", null));
        assertEquals(Indicator.HIGH, pointcare(">600", null));
        assertEquals(Indicator.HIGH, pointcare("95", "H"));
    }

    @Test
    void oneBadHealvetValueDoesNotKillTheOtherTables() throws Exception {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("cCRP", "----");
        String text = render(deviceInput(patient("REX", "Dog", "Male"),
                sample("exigo_eos_vet", DeviceReportRenderTest.exigo()),
                sample("healvet", h)));
        assertTrue(text.contains("10.4"), text);
        assertTrue(text.contains("----"), text);
    }
}
