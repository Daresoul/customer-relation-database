package com.vetclinic.pdf;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DeviceReportRenderTest {

    static Map<String, String> exigo() {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("WBC", "10.4");
        r.put("WBC_L", "6.0");
        r.put("WBC_H", "17.0");
        r.put("HGB", "17.4");
        r.put("HGB_L", "12.0");
        r.put("HGB_H", "18.0");
        return r;
    }

    @Test
    void exigoReportShowsPatientNameAndRows() throws Exception {
        String text = render(deviceInput(patient("BLEKI", "Dog", "Male"), sample("exigo_eos_vet", exigo())));
        assertTrue(text.contains("BLEKI"), text);
        assertTrue(text.contains("10.4"), text);
    }
}
