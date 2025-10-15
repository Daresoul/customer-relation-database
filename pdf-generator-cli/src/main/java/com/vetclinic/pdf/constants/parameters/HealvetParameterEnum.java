package com.vetclinic.pdf.constants.parameters;

import com.vetclinic.pdf.constants.PatientType;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

public enum HealvetParameterEnum {

    // !OK
    PRO_BNP_1_DOG("vNT-proBNP-1", "proBNP", "pg/mL",
            createProBNPRange(0, 8436, "8436.0 - 18981.0",
                    "> 18981", "> 28472", PatientType.DOG)),
    PRO_BNP_2_DOG("vNT-proBNP-2", "proBNP", "pmol/L",
            createProBNPRange(0, 800, "800.0 - 1800.0",
                    "> 1800", "> 2700",  PatientType.DOG)),
    PRO_BNP_1_CAT("vNT-proBNP-1", "proBNP", "pg/mL",
            createProBNPRange(0, 8436, "8436.0 - 18981.0",
                    "> 18981", "> 28472", PatientType.CAT)),
    PRO_BNP_2_CAT("vNT-proBNP-2", "proBNP", "pmol/L",
            createProBNPRange(0, 800, "800.0 - 1800.0",
                    "> 1800", "> 2700",  PatientType.CAT)),

    // !OK
    // I Have the ranges for mIU/L - Milli-International Units per Litre
    // Codes TSH-2, T4-2, CORTISOL-2 ARE IGNORED ...
    TSH_1_DOG("TSH-1", "TSH хормон", "mIU/L",
                createRange(0.0, 37.0, PatientType.DOG)),
    TSH_1_CAT("TSH-1", "TSH хормон", "mIU/L",
                createRange(0.0, 21.0, PatientType.CAT)),
    TSH_2_DOG("TSH-2", "TSH хормон", "ng/mL",
            createRange(0.017, 0.591, PatientType.DOG)),
    TSH_2_CAT("TSH-2", "TSH хормон", "ng/mL",
            createRange(0.03, 0.15, PatientType.CAT)),

    // !OK
    T4_1_DOG("T4-1", "T4 хормон", "nmol/L",
                    createRange(15.0, 60.0, PatientType.DOG)),
    T4_1_CAT("T4-1", "T4 хормон", "nmol/L",
            createRange(15.0, 50.0, PatientType.CAT)),
    T4_2_DOG("T4-2", "T4 хормон", "µg/dL",
            createRange(1.2, 4.7, PatientType.DOG)),
    T4_2_CAT("T4-2", "T4 хормон", "µg/dL",
            createRange(1.2, 3.9, PatientType.CAT)),

    // !OK
    DIMER_DOG("D-Dimer", "D-Dimer", "ng/mL",
                createRange(0.0, 250.0, PatientType.DOG)),
    DIMER_CAT("D-Dimer", "D-Dimer", "ng/mL",
            createRange(0.0, 250.0, PatientType.CAT)),

    // FOR NOW isBeforeACTH will not do any difference whatsoever, but if at some time they understand
    // what to do with it, it will be here to be used properly. For now the same values will be generated
    // for both before and after ACTH test

// THESE WERE THE ONES FOR CORTISOL RANGES WITH ACTH TEST (FROM THE OFFICIAL SITE OF HEALVET DEVICE)
//    CORTISOL_DOG_BEFORE_ACTH("Cortisol-1", "Кортизол", "nmol/L",
//            createCortisolRange(28.0, 170.0, PatientType.DOG, true)),
//    CORTISOL_CAT_BEFORE_ACTH("Cortisol-1", "Кортизол", "nmol/L",
//            createCortisolRange(28.0, 170.0, PatientType.CAT, true)),
//    CORTISOL_DOG_AFTER_ACTH("Cortisol-1", "Кортизол", "nmol/L",
//            createCortisolRange(170.0, 550.0, PatientType.DOG, false)),
//    CORTISOL_CAT_AFTER_ACTH("Cortisol-1", "Кортизол", "nmol/L",
//            createCortisolRange(170.0, 550.0, PatientType.CAT, false)),

// !OK
// THESE RANGES ARE FROM THE OFFICIAL NOTES THAT CAME WITH THE ACTUAL DEVICE
    CORTISOL_1_DOG_BEFORE_ACTH("Cortisol-1", "Кортизол", "nmol/L",
          createCortisolRange(20.0, 110.0,
                  "< 15", "15.0 - 20.0", "110.0 - 130.0", "> 130",
                  PatientType.DOG, true)),
    CORTISOL_1_CAT_BEFORE_ACTH("Cortisol-1", "Кортизол", "nmol/L",
            createCortisolRange(20.0, 110.0,
                    "< 15", "15.0 - 20.0", "110.0 - 130.0", "> 130",
                    PatientType.CAT, true)),
    CORTISOL_1_DOG_AFTER_ACTH("Cortisol-1", "Кортизол", "nmol/L",
            createCortisolRange(20.0, 110.0,
                    "< 15", "15.0 - 20.0", "110.0 - 130.0", "> 130",
                    PatientType.DOG, false)),
    CORTISOL_1_CAT_AFTER_ACTH("Cortisol-1", "Кортизол", "nmol/L",
            createCortisolRange(20.0, 110.0,
                    "< 15", "15.0 - 20.0", "110.0 - 130.0", "> 130",
                    PatientType.CAT, false)),

    CORTISOL_2_DOG_BEFORE_ACTH("Cortisol-2", "Кортизол", "µg/dL",
            createCortisolRange(0.72, 3.99,
                    "< 0.54", "0.54 - 0.72", "3.99 - 4.71", "> 4.71",
                    PatientType.DOG, true)),
    CORTISOL_2_CAT_BEFORE_ACTH("Cortisol-2", "Кортизол", "µg/dL",
            createCortisolRange(0.72, 3.99,
                    "< 0.54", "0.54 - 0.72", "3.99 - 4.71", "> 4.71",
                    PatientType.CAT, true)),
    CORTISOL_2_DOG_AFTER_ACTH("Cortisol-1", "Кортизол", "µg/dL",
            createCortisolRange(0.72, 3.99,
                    "< 0.54", "0.54 - 0.72", "3.99 - 4.71", "> 4.71",
                    PatientType.DOG, false)),
    CORTISOL_2_CAT_AFTER_ACTH("Cortisol-1", "Кортизол", "µg/dL",
            createCortisolRange(0.72, 3.99,
                    "< 0.54", "0.54 - 0.72", "3.99 - 4.71", "> 4.71",
                    PatientType.CAT, false)),


    // !OK
    CRP_DOG_THE_CORRECT_ONE_IS_DOG_ONLY("cCRP", "CRP инфек. маркер", "mg/L",
                createRange(0.0,10.0, PatientType.DOG)),
    CRP_CAT("cCRP", "CRP инфек. маркер", "mg/L",
            createRange(0.0,10.0, PatientType.CAT)),

    // !OK
    SAA_CAT_THE_CORRECT_ONE_IS_CAT_ONLY("SAA", "SAA инфек. маркер", "mg/L",
                    createRange(0.0, 8.0 , PatientType.CAT)),
    SAA_DOG("SAA", "SAA инфек. маркер", "mg/L",
            createRange(0.0, 5.4 , PatientType.DOG));


    private String code;
    private String translated;
    private String unit; // Unit is hard coded
    private Range range;
    private static Logger logger = Logger.getLogger(PointcareParameterEnum.class.getName());

    HealvetParameterEnum(String code, String translated, String unit, Range range) {
        this.code = code;
        this.translated = translated;
        this.unit = unit;
        this.range = range;
    }

    public static List<HealvetParameterEnum> getAllParameters() {
        List<HealvetParameterEnum> types = new ArrayList<>();
        types.add(TSH_1_DOG);
        types.add(TSH_1_CAT);
        types.add(TSH_2_DOG);
        types.add(TSH_2_CAT);
        types.add(T4_1_DOG);
        types.add(T4_2_DOG);
        types.add(T4_1_CAT);
        types.add(T4_2_CAT);
        types.add(DIMER_DOG);
        types.add(DIMER_CAT);
        types.add(CORTISOL_1_DOG_BEFORE_ACTH);
        types.add(CORTISOL_1_CAT_BEFORE_ACTH);
        types.add(CORTISOL_1_DOG_AFTER_ACTH);
        types.add(CORTISOL_1_CAT_AFTER_ACTH);
        types.add(CORTISOL_2_DOG_BEFORE_ACTH);
        types.add(CORTISOL_2_CAT_BEFORE_ACTH);
        types.add(CORTISOL_2_DOG_AFTER_ACTH);
        types.add(CORTISOL_2_CAT_AFTER_ACTH);
        types.add(CRP_DOG_THE_CORRECT_ONE_IS_DOG_ONLY);
        types.add(CRP_CAT);
        types.add(SAA_CAT_THE_CORRECT_ONE_IS_CAT_ONLY);
        types.add(SAA_DOG);
        types.add(PRO_BNP_1_DOG);
        types.add(PRO_BNP_2_DOG);
        types.add(PRO_BNP_1_CAT);
        types.add(PRO_BNP_2_CAT);
        return types;
    }

    public static HealvetParameterEnum getParameterByProperties(String code, PatientType patientType,
                                                                Boolean forCortisolIsBeforeACTHTest) {

//        forCortisolIsBeforeACTHTest can be null if we don't need Cortisol parameter because this is only for it
        if (code == null || code.isEmpty() || patientType == null) {
            return null;
        }

        List<HealvetParameterEnum> parameters = getAllParameters();
        for(HealvetParameterEnum parameter : parameters) {
//            System.out.println("Param code: " + code);
//            System.out.println("Iterated item code: " + parameter.getCode());
//            System.out.println("Param patient type: " + patientType.getCode());
//            System.out.println("Iterated patient type: " + parameter.getRange().getPatientType().getCode());

            // TODO: probaj za contains dali treba ???????
                if (StringUtils.equalsIgnoreCase(code, parameter.getCode()) && parameter.getRange() != null &&
                        patientType.equals(parameter.getRange().getPatientType())) {

//                    System.out.println(" -------------- Got the healvet parameter");

                    if (forCortisolIsBeforeACTHTest == null) {
                        return parameter;
                    }

                    if (parameter.getRange() instanceof CortisolRange) {
                        CortisolRange cortisolRange = (CortisolRange) parameter.getRange();
//                        System.out.println("It's about CORTISOL Healvet parameter : param isBeforeACTH: " + forCortisolIsBeforeACTHTest +
//                                " and iterated isBeforeACTH: " + cortisolRange.isBeforeACTH());
                        if (forCortisolIsBeforeACTHTest == cortisolRange.isBeforeACTH()) {
                            return parameter;
                        }
                    } else {
                        // TODO: Maybe throw an IllegalStateException here ...
                        logger.severe("Range of Cortisol parameter is not of type CortisolRange");
                    }
                }

        }

        logger.severe("No HealvetParameterType for code " + code + " and patient type " +
                patientType.getCode());
        return null;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getTranslated() {
        return translated;
    }

    public void setTranslated(String translated) {
        this.translated = translated;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public static Logger getLogger() {
        return logger;
    }

    public static void setLogger(Logger logger) {
        HealvetParameterEnum.logger = logger;
    }

    public static Range createRange(double lowRange, double highRange, PatientType patientType) {
        return new Range(lowRange, highRange, patientType);
    }

    public static CortisolRange createCortisolRange(double lowFromNormalRange, double highFromNormalRange,
                                                    String lowRanges,
                                                    String flatRanges, String highRanges,
                                                    String overtopRanges, PatientType patientType,
                                                    boolean isBeforeACTH) {
        return new CortisolRange(lowFromNormalRange, highFromNormalRange, lowRanges, flatRanges, highRanges, overtopRanges,
                patientType, isBeforeACTH);
    }

    public static ProBNPRange createProBNPRange(double lowFromNormalRange, double highFromNormalRange,
                                                String highRiskRanges,
                                                String heartFailureRanges, String CHFRanges,
                                                PatientType patientType) {
        return new ProBNPRange(lowFromNormalRange, highFromNormalRange, highRiskRanges, heartFailureRanges,
                CHFRanges, patientType);
    }

    public Range getRange() {
        return range;
    }

    public void setRange(Range range) {
        this.range = range;
    }

}
