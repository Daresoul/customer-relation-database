package com.vetclinic.pdf.exceptions;

public class GeneratingPDFReportException extends Exception {

    private String message;

    public GeneratingPDFReportException(String s) {
        message = s;
    }

    @Override
    public String getMessage() {
        return message;
    }
}
