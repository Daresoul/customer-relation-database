package com.vetclinic.pdf.exceptions;

public class ListeningOnWrongPortException extends Exception {

    private String message;

    public ListeningOnWrongPortException(String s) {
        message = s;
    }

    @Override
    public String getMessage() {
        return message;
    }
}
