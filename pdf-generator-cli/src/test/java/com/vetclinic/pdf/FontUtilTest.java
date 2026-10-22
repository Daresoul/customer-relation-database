package com.vetclinic.pdf;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class FontUtilTest {

    @Test
    void embeddedFontLoads() {
        assertNotNull(FontUtil.loadFont("/com/vetclinic/pdf/assets/fonts/probaPro/Mint Type - Proba Pro Regular.otf"));
    }

    // A Helvetica fallback drops every Cyrillic letter but still "succeeds";
    // a missing font must stop the job (exit 1) instead.
    @Test
    void missingFontFailsLoudly() {
        assertThrows(IllegalStateException.class,
                () -> FontUtil.loadFont("/com/vetclinic/pdf/assets/fonts/missing.otf"));
    }
}
