package com.vetclinic.pdf.exceptions;

public class ParsingHealvetSampleException extends Exception {

    private String message;

    public ParsingHealvetSampleException(String s) {
        message = s;
    }

    @Override
    public String getMessage() {
        return message;
    }
}
