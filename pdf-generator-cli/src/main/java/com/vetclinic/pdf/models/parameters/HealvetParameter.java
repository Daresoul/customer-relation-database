package com.vetclinic.pdf.models.parameters;

import com.vetclinic.pdf.constants.parameters.HealvetParameterEnum;
import com.vetclinic.pdf.constants.parameters.CortisolRange;
import com.vetclinic.pdf.constants.parameters.ProBNPRange;
import com.vetclinic.pdf.constants.parameters.Range;
import com.vetclinic.pdf.util.ResultClassifier;

import java.util.logging.Logger;

public class HealvetParameter extends Parameter {

    HealvetParameterEnum healvetParameterEnum;
    Logger logger = Logger.getLogger(this.getClass().getName());

    public HealvetParameter() {
        super();

    }

    public HealvetParameterEnum getHealvetParameterEnum() {
        return healvetParameterEnum;
    }

    // on each set of the healvetParameterEnum we will reset the values in the Parameter class
    // so when in NewReportController there will be change of either patient type or
    // in instance of Cortisol ranges before/after ACTH test we will reset the parameter
    public void setHealvetParameterEnum(HealvetParameterEnum healvetParameterEnum) {

//        System.out.println("Set HealvetParameter Enum, with new ranges: " +
//                healvetParameterEnum.getRange().getRangesInStringRepresentation());
        this.healvetParameterEnum = healvetParameterEnum;
        this.setName(healvetParameterEnum.getTranslated());
        Range range = healvetParameterEnum.getRange();
        if (range == null) {
            logger.severe("Range of HealvetParameterEnum is null ... This shouldn't happen");
            return;
        }

        if (range instanceof CortisolRange) {
            CortisolRange cortisolRange = (CortisolRange) range;
            this.setReferentValues(cortisolRange.getLowRanges() + " [low] \n" +
                    cortisolRange.getFlatRanges() + " [flat]\n" +
                    cortisolRange.getNormalRangesInStringRepresentation() + " [normal]\n"
                    + cortisolRange.getHighRanges() + " [high]\n" +
                    cortisolRange.getOvertopRanges() + " [overtop]");
        } else if (range instanceof ProBNPRange) {
            ProBNPRange proBNPRange = (ProBNPRange) range;
            this.setReferentValues(proBNPRange.getNormalRangesInStringRepresentation() + " [normal] \n" +
                    proBNPRange.getHighRiskRanges() + " [high risk] \n"
                    + proBNPRange.getHeartFailureRanges() + " [heart failure]\n" +
                    proBNPRange.getCHFRanges() + " [cong.HF]");
        } else {
            this.setReferentValues(range.getNormalRangesInStringRepresentation());
        }

        this.setIndicator(ResultClassifier.classify(this.getResult(), range.getLowRange(), range.getHighRange()));
        this.setUnit(healvetParameterEnum.getUnit());
    }

//    @Override
//    public boolean equals(Object obj) {
//        if (obj instanceof HealvetParameter) {
//            HealvetParameter a = (HealvetParameter) obj;
//            System.out.println("EQUALS HEALVET PARAMETER");
//            return this.getName() != null && this.getName().equals(a.getName()) &&
//                    this.getResult() != null && this.getResult().equals(a.getResult()) &&
//                    this.getIndicator() == a.getIndicator() &&
//                    this.getReferentValues() != null && this.getReferentValues().equals(a.getReferentValues()) &&
//                    this.getHealvetParameterEnum() == a.getHealvetParameterEnum();
//        }
//        return false;
//    }
}
