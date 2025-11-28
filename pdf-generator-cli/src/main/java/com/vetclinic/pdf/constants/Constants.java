package com.vetclinic.pdf.constants;

import com.vetclinic.pdf.Util;

public class Constants {

    // RELATIVE PATHS ASSETS OR COMPONENT, ARE GIVEN FROM THE MAIN PACKAGE, YOU HAVE TO COME
    // TO THAT POSITION FROM CODE

    public static String getExigoExportedResultsDirectoryPath() {
        return Util.getResource(Constants.RESOURCE_EXIGO_EXPORTED_RESULTS);
    }

    public static String getPdfResultsDirectoryPath() {
        return Util.getResource(Constants.RESOURCE_PDF_RESULTS);
    }

    public static final String TEMP_WORKING_PDF_FILENAME=".tmp";
    public static final String RESOURCE_EXIGO_EXPORTED_RESULTS = "exigo-exported-results-directory";
    public static final String RESOURCE_PDF_RESULTS = "processed-results-directory";
    public static final String RESOURCE_EXIGO_COM_PORT = "exigo-com-port";
    public static final String RESOURCE_POINTCARE_COM_PORT = "pointcare-com-port";
    public static final String RESOURCE_HEALVET_COM_PORT = "healvet-com-port";
    public static final String MAIN_PACKAGE = "com.beatrix.print";
    public static final String BUNDLE_NAME = "config";
    public static final String HIDDEN_WORK_DIR = ".btrx-prnt";
    public static final String DATABASE_FILENAME = "beatrix-print.db";
    public static final String GOTHIC_FONT = "/assets/fonts/gothic/GOTHIC.ttf";
    public static final String FREE_SANS_FONT = "/assets/fonts/freeSans/FreeSans.ttf";
    public static final String CANDARA_FONT = "/assets/fonts/candara/Candara.ttf";
    public static final String PROBA_PRO_FONT = "/assets/fonts/probaPro/Mint Type - Proba Pro Regular.otf";
    public static final String LOGO = "assets/images/logo.png";
    public static final String PRELOADER_MEDIA = "assets/media/preloader.mp4";
    public static final String ICON = "assets/images/icon.png";
    public static final String HEMATOLOGY_TITLE = "assets/images/hematology.png";
    public static final String SOCIALS = "assets/images/socials.png";
    public static final int LOGO_WIDHT = 192;
    public static final int LOGO_HEIGHT = 195;
    public static final int LEFT_DOC_MARGIN = 15;
    public static final int RIGHT_DOC_MARGIN = 15;
    public static final int TOP_DOC_MARGIN = 5;
    public static final int BOTTOM_DOC_MARGIN = 5;

    public static final String DATE_TIME_DELIMITER = "T";
    public static final String DATE_DELIMITER = "-";
    public static final String TIME_DELIMITER = ":";

    public static final String DATE_PATTERN = "dd/MM/yyyy";
    public static final String STATIC_XML_FILE_NAME = "BM-53672_";

    public static final int SQL_UNIQUE_ERROR_CODE = 19;
    public static final String DEFAULT_MICRO_CHIP = "8070500000";

    public static final String CSS_CLASS_BUTTON_TRANSPARENT = "button-transparent";
    public static final String CSS_CLASS_CLICKABLE_ITEM = "clickable-item";
    public static final String CSS_CLASS_BOLD_TEXT = "bold-text";
    public static final String CSS_CLASS_SELECTED_PATIENT_FROM_SUGGESTION = "selected-item-from-suggestion";

}
