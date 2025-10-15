package com.vetclinic.pdf.exceptions;

public class ParsingPointcareSampleException extends Exception {

    private String message;

    public ParsingPointcareSampleException(String s) {
        message = s;
    }

    @Override
    public String getMessage() {
        return message;
    }
}
