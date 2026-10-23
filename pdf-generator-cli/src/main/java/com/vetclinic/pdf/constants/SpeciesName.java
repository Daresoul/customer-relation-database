package com.vetclinic.pdf.constants;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** The app's default species, stored by English name, as the app shows them in Macedonian. */
public final class SpeciesName {

    private static final Map<String, String> MACEDONIAN = new HashMap<>();

    static {
        MACEDONIAN.put("dog", "Куче");
        MACEDONIAN.put("cat", "Мачка");
        MACEDONIAN.put("bird", "Птица");
        MACEDONIAN.put("rabbit", "Зајак");
        MACEDONIAN.put("hamster", "Хрчак");
        MACEDONIAN.put("guinea pig", "Морско прасе");
        MACEDONIAN.put("ferret", "Ласица");
        MACEDONIAN.put("reptile", "Рептил");
        MACEDONIAN.put("fish", "Риба");
        MACEDONIAN.put("other", "Друго");
    }

    private SpeciesName() {
    }

    /** A species the clinic added (already in its own words) is kept as it is. */
    public static String macedonian(String stored) {
        if (stored == null) {
            return "";
        }
        String key = stored.trim().toLowerCase(Locale.ROOT).replace('_', ' ').replaceAll("\\s+", " ");
        return MACEDONIAN.getOrDefault(key, stored.trim());
    }
}
