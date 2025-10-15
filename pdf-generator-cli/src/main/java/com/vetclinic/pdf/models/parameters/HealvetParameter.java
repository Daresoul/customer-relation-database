package com.vetclinic.pdf.models.parameters;

import com.vetclinic.pdf.constants.Indicator;
import com.vetclinic.pdf.constants.parameters.HealvetParameterEnum;
import com.vetclinic.pdf.constants.parameters.CortisolRange;
import com.vetclinic.pdf.constants.parameters.ProBNPRange;
import com.vetclinic.pdf.constants.parameters.Range;

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

        if (this.getResult() != null && !this.getResult().isEmpty()) {
            String result = this.getResult();
            String resultForParsing;
            boolean lessThen = false;
            boolean moreThen = false;
            if (result.contains("<")) {
                lessThen = true;
                resultForParsing = result.replace("<", "");
            } else if (result.contains(">")) {
                moreThen = true;
                resultForParsing = result.replace(">", "");
            } else {
                resultForParsing = result;
            }
            double resultDouble = Double.parseDouble(resultForParsing);
            if (resultDouble < range.getLowRange()) {
                this.setIndicator(Indicator.LOW);
            } else if (resultDouble > range.getHighRange()) {
                this.setIndicator(Indicator.HIGH);
            } else if (resultDouble == range.getLowRange()) {
                if (lessThen) {
                    this.setIndicator(Indicator.LOW);
                } else {
                    this.setIndicator(Indicator.NORMAL);
                }
            } else if (resultDouble == range.getHighRange()) {
                if (moreThen) {
                    this.setIndicator(Indicator.HIGH);
                } else {
                    this.setIndicator(Indicator.NORMAL);
                }
            } else {
                this.setIndicator(Indicator.NORMAL);
            }
        }
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
