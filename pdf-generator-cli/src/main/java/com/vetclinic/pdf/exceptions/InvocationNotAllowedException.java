package com.vetclinic.pdf.exceptions;

public class InvocationNotAllowedException extends Exception {

    private String message;

    public InvocationNotAllowedException(String s) {
        message = s;
    }

    @Override
    public String getMessage() {
        return message;
    }
}


