package com.vetclinic.pdf.exceptions;

public class CreatingDirectoryException extends Exception {

    private String directoryToBeCreatedPath;
    private String reason;

    public CreatingDirectoryException(String directoryToBeCreatedPath, String reason) {
        super();
        this.directoryToBeCreatedPath = directoryToBeCreatedPath;
        this.reason = reason;
    }

    @Override
    public String getMessage() {
        return "Directory " + directoryToBeCreatedPath + " cannot be created. Reason: " + reason;
    }
}
