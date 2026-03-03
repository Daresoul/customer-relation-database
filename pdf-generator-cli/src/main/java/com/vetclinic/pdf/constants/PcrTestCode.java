package com.vetclinic.pdf.constants;

/**
 * PCR test codes for MNCHIP PointCare PCR Analyzer
 * Each code has an English name and Macedonian translation
 */
public enum PcrTestCode {
    CDV("CDV", "Canine Distemper Virus", "Вирус на кучешка чума"),
    CPIV("CPIV", "Canine Parainfluenza Virus", "Кучешки параинфлуенца вирус"),
    CAV2("CAV-2", "Canine Adenovirus Type 2", "Кучешки аденовирус тип 2"),
    Bb("Bb", "Bordetella bronchiseptica", "Бордетела бронхисептика"),
    MC("MC", "Mycoplasma cynos", "Микоплазма цинос"),
    IC("IC", "Internal Control", "Интерна контрола");

    private final String code;
    private final String englishName;
    private final String macedonianName;

    PcrTestCode(String code, String englishName, String macedonianName) {
        this.code = code;
        this.englishName = englishName;
        this.macedonianName = macedonianName;
    }

    public String getCode() {
        return code;
    }

    public String getEnglishName() {
        return englishName;
    }

    public String getMacedonianName() {
        return macedonianName;
    }

    /**
     * Get PcrTestCode by its code string
     * @param code The code string (e.g., "CDV", "CAV-2")
     * @return The matching PcrTestCode or null if not found
     */
    public static PcrTestCode fromCode(String code) {
        if (code == null) {
            return null;
        }
        for (PcrTestCode testCode : values()) {
            if (testCode.code.equalsIgnoreCase(code)) {
                return testCode;
            }
        }
        return null;
    }

    /**
     * Get the negative range threshold for PCR tests
     * @return The range string for negative results
     */
    public static String getNegativeRange() {
        return ">36 or NoCt";
    }

    /**
     * Get the positive range threshold for PCR tests
     * @return The range string for positive results
     */
    public static String getPositiveRange() {
        return "<=36";
    }
}
