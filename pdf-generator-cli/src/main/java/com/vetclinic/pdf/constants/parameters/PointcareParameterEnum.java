package com.vetclinic.pdf.constants.parameters;

import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

public enum PointcareParameterEnum {

    ALB("ALB", "ALB - албумин"),
    CK("CK","CK - креатин киназа"),
    BUNCRE("BUN/CRE","BUN/CRE"),
    CRE("CRE","CRE - креатинин"),
    ALP("ALP","ALP"),
    TBIL("TBIL","TBIL - т.билирубин"),
    ALT("ALT","ALT"),
    CHOL("CHOL","CHOL - холестерол"),
    AMY("AMY","AMY - амилаза"),
    P("P","P - фосфор"),
    BUN("BUN","BUN - уреа"),
    GLU("GLU","GLU - гликоза"),
    Ca("Ca","Ca - калциум"),
    AG("A/G","A/G"),
    GLO("GLO","GLO - глобулин"),
    TP("TP","TP - вк.протеини"),

    AST("AST","AST"),
    GGT("GGT","GGT"),
    DBIL("DBIL","DBIL - дир.билирубин"),
    IBIL("IBIL","IBIL - индир.билирубин"),

    K_PLUS("K+","K+ калиум"),
    NA_PLUS("Na+","Na+ натриум"),
    NA_K("Na+/K+","Na+/K+"),
    CL_MINUS("Cl-","Cl- хлор"),
    CO2("CO2","CO2 - јаг.диоксид"),
    MG("Mg","Mg - магнезиум");


    private String code;
    private String translated;
    private static Logger logger = Logger.getLogger(PointcareParameterEnum.class.getName());

    PointcareParameterEnum(java.lang.String code, java.lang.String translated) {
        this.code = code;
        this.translated = translated;
    }

    public static List<PointcareParameterEnum> getAllParameters() {
        List<PointcareParameterEnum> types = new ArrayList<>();
        types.add(ALB);
        types.add(CK);
        types.add(BUNCRE);
        types.add(CRE);
        types.add(ALP);
        types.add(TBIL);
        types.add(ALT);
        types.add(CHOL);
        types.add(AMY);
        types.add(P);
        types.add(BUN);
        types.add(GLU);
        types.add(Ca);
        types.add(AG);
        types.add(GLO);
        types.add(TP);
        types.add(AST);
        types.add(GGT);
        types.add(DBIL);
        types.add(IBIL);
        types.add(K_PLUS);
        types.add(NA_PLUS);
        types.add(NA_K);
        types.add(CL_MINUS);
        types.add(CO2);
        types.add(MG);
        return types;
    }

    public static PointcareParameterEnum getParameterForCode(String code) {
        if (code == null || code.isEmpty()) {
            return null;
        }
        List<PointcareParameterEnum> profiles = getAllParameters();
        for(PointcareParameterEnum parameter : profiles) {
            if (StringUtils.equalsIgnoreCase(code, parameter.getCode())) {

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
}
