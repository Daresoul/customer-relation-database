package com.vetclinic.pdf.constants.parameters;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

public enum ExigoParameterEnum {

    PLT("PLT", "PLT - тромбоцити"),
    MPV("MPV", "MPV"),
    HGB("HGB", "HGB - хемоглобин"),
    WBC("WBC", "WBC - леукоцити"),
    LA("LA", "LA - лимфоцити"),
    MA("MA", "MA - моноцити"),
    GA("GA", "NEUT - неутрофили"),
    LR("LR", "LR - лимфоцити %"),
    MR("MR", "MR - моноцити %"),
    GR("GR", "GR - гранулоцити %"),
    EA("EA", "EA - еозинофили"),
    ER("ER", "ER - еозинофили %"),
    RBC("RBC", "RBC - еритроцити"),
    MCV("MCV", "MCV"),
    HCT("HCT", "HCT - хематокрит"),
    MCH("MCH", "MCH"),
    MCHC("MCHC", "MCHC"),
    RDWR("RDWR", "RDW %"),
    RDWA("RDWA", "RDW");


    private String code;
    private String translated;
    private static Logger logger = Logger.getLogger(PointcareParameterEnum.class.getName());

    ExigoParameterEnum(String code, String translated) {
        this.code = code;
        this.translated = translated;
    }
    public static List<ExigoParameterEnum> getAllParameters() {
        List<ExigoParameterEnum> types = new ArrayList<>();
        types.add(PLT);
        types.add(MPV);
        types.add(HGB);
        types.add(WBC);
        types.add(LA);
        types.add(MA);
        types.add(GA);
        types.add(LR);
        types.add(MR);
        types.add(GR);
        types.add(EA);
        types.add(ER);
        types.add(RBC);
        types.add(MCV);
        types.add(HCT);
        types.add(MCH);
        types.add(MCHC);
        types.add(RDWR);
        types.add(RDWA);
        return types;
    }

    public static ExigoParameterEnum getParameterForCode(String code) {
        if (code == null || code.isEmpty()) {
            return null;
        }
        List<ExigoParameterEnum> profiles = getAllParameters();
        for(ExigoParameterEnum parameter : profiles) {
            if (StringUtils.containsIgnoreCase(code, parameter.getCode())) {

                return parameter;
            }
        }

        logger.severe("No PointcareParameterType for code: " + code);
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

    public static Logger getLogger() {
        return logger;
    }

    public static void setLogger(Logger logger) {
        ExigoParameterEnum.logger = logger;
    }
}
