package com.vetclinic.pdf.constants;

/**
 * CLI version - JavaFX Properties removed
 */
public enum AppStage {

    MAIN_APP("components/main.fxml"),
    EXIGO_SAMPLES("components/exigoSamples.fxml"),
    PREVIEW_GENERATED_PDF("components/pdfViewer.fxml");

    private String resource;
    private boolean isOpened;

    AppStage(String resource) {
        this.resource = resource;
        this.isOpened = false;
    }

    public String getResource() {
        return resource;
    }

    public void setResource(String resource) {
        this.resource = resource;
    }

    public void setOpened() {
        this.isOpened = true;
    }

    public void setClosed() {
        this.isOpened = false;
    }

    public boolean isOpened() {
        return isOpened;
    }
}
