package com.vetclinic.pdf;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.vetclinic.pdf.PdfTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;

class AnalysisDateTest {

    private static String pcrRender(JsonObject s) throws Exception {
        return render(deviceInput(patient("REX", "Dog", "Male"), s));
    }

    @Test
    void deviceTimeIsPrintedAsLocalDisplayDate() throws Exception {
        JsonObject s = sample("exigo_eos_vet", DeviceReportRenderTest.exigo());
        s.addProperty("analysis_datetime", "2026-07-10T14:52:11");
        String text = render(deviceInput(patient("REX", "Dog", "Male"), s));
        assertTrue(text.contains("Датум: 10/07/2026 14:52"), text);
        assertFalse(text.contains("2026-07-10T"), text);
    }

    @Test
    void withoutDeviceTimeTheReceiveInstantIsShownInLocalTime() throws Exception {
        JsonObject s = sample("exigo_eos_vet", DeviceReportRenderTest.exigo());
        s.addProperty("detected_at", "2026-07-12T07:30:12.123456789+00:00");
        String expected = OffsetDateTime.parse("2026-07-12T07:30:12.123456789+00:00")
                .atZoneSameInstant(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
        String text = render(deviceInput(patient("REX", "Dog", "Male"), s));
        assertTrue(text.contains("Датум: " + expected), text);
        assertFalse(text.contains("+00:00"), text);
    }

    @Test
    void pcrFooterUsesDeviceTime() throws Exception {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("IC", "32.03");
        JsonObject s = sample("pcr", r);
        s.addProperty("analysis_datetime", "2026-06-04T10:18:01");
        String text = pcrRender(s);
        assertTrue(text.contains("Датум на анализа:04/06/2026 10:18"), text);
    }

    @Test
    void pointcareSampleLineUsesDeviceTime() throws Exception {
        Map<String, String> r = new LinkedHashMap<>();
        r.put("GLU", "95");
        r.put("GLU_flag", "N");
        JsonObject s = sample("pointcare", r);
        s.addProperty("analysis_datetime", "2026-01-14T22:12:13");
        String text = render(deviceInput(patient("REX", "Dog", "Male"), s));
        assertTrue(text.contains("Датум: 14/01/2026 22:12"), text);
    }
}
