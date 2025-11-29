package com.vetclinic.pdf;

import com.itextpdf.text.BaseColor;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.Font;
import com.itextpdf.text.pdf.BaseFont;
import com.vetclinic.pdf.constants.Constants;

import java.io.IOException;
import java.util.logging.Logger;

public class FontUtil {


    private static BaseFont MACEDONIAN_FONT;
    private static final int DEFAULT_FONT = 15;
    public static final int MACEDONIAN = 0;
    public static final BaseColor DEFAULT_FONT_COLOR = BaseColor.DARK_GRAY;
    public static final BaseColor CYAN_DARK_FONT_COLOR = Util.CYAN_DARK_COLOR;
    public static final BaseColor OKAY_RESULT_FONT_COLOR = Util.CYAN_COLOR;
    public static final BaseColor BAD_RESULT_FONT_COLOR = Util.RED_COLOR;
    private static Logger logger = Logger.getLogger(FontUtil.class.getName());

    public static Font getMacedonianFont() {
        return getMacedonianFont(15);
    }

    public static Font getMacedonianFont(float size) {

        return getMacedonianFont(size, DEFAULT_FONT_COLOR);
    }

    public static Font getMacedonianFont(float size, BaseColor color) {

        if (MACEDONIAN_FONT != null) {
            return new Font(MACEDONIAN_FONT, size, Font.UNDEFINED, color);
        }

        BaseFont font = null;
        try {
//            font = getEmbeddedFont(Constants.PROBA_PRO_FONT, "Cp1251");
            font = getEmbeddedFont(Constants.CANDARA_FONT, "Cp1251");
        } catch (IOException | DocumentException e) {
            e.printStackTrace();
        }

        MACEDONIAN_FONT = font;
        return new Font(MACEDONIAN_FONT, size, Font.UNDEFINED, color);
    }

    private static BaseFont getEmbeddedFont(String font, String requestedEncoding) throws IOException, DocumentException {

        if(!isEncodingSupported(font, requestedEncoding)) {
            logger.info("Encoding " + requestedEncoding + " is not supported for font with absPath: " + font);
            return null;
        }
        return BaseFont.createFont(font, requestedEncoding, BaseFont.EMBEDDED);
    }

    private static boolean isEncodingSupported(String font, String encoding) throws DocumentException, IOException {

        BaseFont baseFont = BaseFont.createFont(font, "", BaseFont.EMBEDDED);

        String[] supportedEncodings = baseFont.getCodePagesSupported();
        for (String supportedEncodingPrint : supportedEncodings) {
            String[] chunks = supportedEncodingPrint.split(" ");
            String supportedEncoding = chunks[0];
            if (("Cp".concat(supportedEncoding)).equals(encoding)) {
                return true;
            }
        }
        return false;
    }
}
