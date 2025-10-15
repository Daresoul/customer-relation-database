package com.vetclinic.pdf.models.parameters;

import com.vetclinic.pdf.constants.Indicator;

public class Parameter {

    private String name;
    private String result;
    private String referentValues;
    private String unit;
    private Indicator indicator;

    public Parameter() {

    }

    public Parameter(String name, String result, String referentValues,
                     String unit, Indicator indicator) {
        this.name = name;
        this.result = result;
        this.referentValues = referentValues;
        this.unit = unit;
        this.indicator = indicator;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getReferentValues() {
        return referentValues;
    }

    public void setReferentValues(String referentValues) {
        this.referentValues = referentValues;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public Indicator getIndicator() {
        return indicator;
    }

    public void setIndicator(Indicator indicator) {
        this.indicator = indicator;
    }
}
