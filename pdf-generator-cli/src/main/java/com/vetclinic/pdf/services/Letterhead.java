package com.vetclinic.pdf.services;

import com.itextpdf.text.BaseColor;
import com.itextpdf.text.Element;
import com.itextpdf.text.Font;
import com.itextpdf.text.Image;
import com.itextpdf.text.Phrase;
import com.itextpdf.text.pdf.ColumnText;
import com.itextpdf.text.pdf.PdfContentByte;
import com.vetclinic.pdf.FontUtil;
import com.vetclinic.pdf.models.ClinicProfile;

import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

import static com.vetclinic.pdf.models.ClinicProfile.or;

/**
 * Writes the clinic profile over the letterhead baked into the PDF
 * templates. Each part (name, logo, contact footer, bank block) is
 * covered and redrawn only when the profile fills it; a blank field in a
 * redrawn part keeps the template's own text. The template's text stays
 * underneath the cover, so it is still in the PDF's text layer.
 */
public final class Letterhead {

    private static final Logger logger = Logger.getLogger(Letterhead.class.getName());

    static final String BAKED_NAME = "Д-р Марин Величковски";
    static final String BAKED_ADDRESS = "Ул. Васко Карангелески бр.9";
    static final String BAKED_CITY = "1000 Скопје";
    static final String BAKED_PHONE = "070 / 340 – 846";
    static final String BAKED_EMAIL = "marin.vet20@gmail.com";
    static final String BAKED_BANK_ACCOUNT = "200002797085202";
    static final String BAKED_BANK_NAME = "Стопанска Банка";
    static final String BAKED_TAX_NUMBER = "4030005564051";

    static final String BAKED_NOTE_ADDRESS = "Васко Каранѓелески бр. 9";
    static final String BAKED_NOTE_CITY = "Скопје, Македонија";
    static final String BAKED_NOTE_PHONE = "070 / 340 - 846";
    static final String BAKED_NOTE_EMAIL = "info@doktormarin.com.mk";

    private static final BaseColor NAME_COLOR = new BaseColor(64, 64, 64);
    private static final BaseColor NOTE_BAND_COLOR = new BaseColor(83, 187, 178);
    private static final BaseColor NOTE_FOOTER_COLOR = new BaseColor(140, 140, 140);

    private Letterhead() {
    }

    /** Rapport.pdf: medical report. */
    public static void stampReport(PdfContentByte canvas, ClinicProfile clinic) {
        if (clinic.name != null) {
            cover(canvas, 150, 740.5f, 362, 764, BaseColor.WHITE);
            fitLine(canvas, clinic.name, Element.ALIGN_RIGHT, 352, 746, 200, 16, NAME_COLOR);
        }
        if (clinic.hasLogo()) {
            logo(canvas, clinic.logoPath, 442.5f, 754.4f, 62, 48);
        }
        if (clinic.hasContact()) {
            cover(canvas, 150, 21, 445, 68, BaseColor.WHITE);
            centredLines(canvas, footerLines(clinic), 297.6f, new float[]{57, 46, 35.5f, 24}, 8);
        }
    }

    /** invoice.pdf: drawn on every page of an invoice. */
    public static void stampInvoice(PdfContentByte canvas, ClinicProfile clinic) {
        if (clinic.name != null) {
            cover(canvas, 188, 746, 380, 765.5f, BaseColor.WHITE);
            fitLine(canvas, clinic.name, Element.ALIGN_LEFT, 193, 751, 185, 15, NAME_COLOR);
        }
        if (clinic.hasLogo()) {
            logo(canvas, clinic.logoPath, 125, 741.9f, 56, 44);
        }
        if (clinic.hasBankDetails()) {
            cover(canvas, 390, 736, 590, 780, BaseColor.WHITE);
            List<String> lines = new ArrayList<>();
            lines.add("ж.с – ка бр: " + or(clinic.bankAccount, BAKED_BANK_ACCOUNT));
            lines.add("депонент: " + or(clinic.bankName, BAKED_BANK_NAME));
            lines.add("едбм: " + or(clinic.taxNumber, BAKED_TAX_NUMBER));
            if (clinic.registrationNumber != null) {
                lines.add("ЕМБС: " + clinic.registrationNumber);
            }
            float baseline = 769.4f;
            for (String line : lines) {
                ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                        new Phrase(line, FontUtil.getMacedonianFont(7, FontUtil.DEFAULT_FONT_COLOR)), 394.5f, baseline, 0);
                baseline -= 8.4f;
            }
        }
        if (clinic.hasContact()) {
            cover(canvas, 150, 2, 445, 44, BaseColor.WHITE);
            centredLines(canvas, footerLines(clinic), 297.6f, new float[]{34.3f, 24.6f, 15, 5}, 8);
        }
    }

    /** pharmacy_note.pdf: the letterhead is one image, so the name sits on the teal band. */
    public static void stampPharmacyNote(PdfContentByte canvas, ClinicProfile clinic) {
        if (clinic.name != null) {
            cover(canvas, 146, 770.5f, 326, 799.5f, NOTE_BAND_COLOR);
            fitLine(canvas, clinic.name, Element.ALIGN_LEFT, 150, 778, 172, 18, BaseColor.WHITE);
        }
        if (clinic.hasLogo()) {
            logo(canvas, clinic.logoPath, 372.5f, 786.9f, 52, 40);
        }
        if (clinic.address != null || clinic.city != null || clinic.phone != null || clinic.email != null) {
            cover(canvas, 150, 37.5f, 450, 58, BaseColor.WHITE);
            Font font = FontUtil.getMacedonianFont(9, NOTE_FOOTER_COLOR);
            String line1 = or(clinic.address, BAKED_NOTE_ADDRESS) + " - " + or(clinic.city, BAKED_NOTE_CITY)
                    + "   tel. " + or(clinic.phone, BAKED_NOTE_PHONE);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT, new Phrase(line1, font), 156, 48.5f, 0);
            ColumnText.showTextAligned(canvas, Element.ALIGN_LEFT,
                    new Phrase(or(clinic.email, BAKED_NOTE_EMAIL), font), 156, 39.5f, 0);
        }
    }

    /** The logo image, or null when there is none or it can't be read. */
    public static Image logoImage(ClinicProfile clinic) {
        if (!clinic.hasLogo()) return null;
        try {
            return Image.getInstance(clinic.logoPath);
        } catch (Exception e) {
            logger.warning("Clinic logo could not be read (" + clinic.logoPath + "): " + e.getMessage());
            return null;
        }
    }

    private static List<String> footerLines(ClinicProfile clinic) {
        List<String> lines = new ArrayList<>();
        lines.add("ВЕТЕРИНАРНА КЛИНИКА " + or(clinic.name, BAKED_NAME));
        lines.add(or(clinic.address, BAKED_ADDRESS) + ", " + or(clinic.city, BAKED_CITY));
        lines.add("тел. " + or(clinic.phone, BAKED_PHONE));
        lines.add("e – mail: " + or(clinic.email, BAKED_EMAIL));
        return lines;
    }

    private static void cover(PdfContentByte canvas, float llx, float lly, float urx, float ury, BaseColor color) {
        canvas.saveState();
        canvas.setColorFill(color);
        canvas.rectangle(llx, lly, urx - llx, ury - lly);
        canvas.fill();
        canvas.restoreState();
    }

    private static void centredLines(PdfContentByte canvas, List<String> lines, float x, float[] baselines, float size) {
        for (int i = 0; i < lines.size() && i < baselines.length; i++) {
            fitLine(canvas, lines.get(i), Element.ALIGN_CENTER, x, baselines[i], 290, size, FontUtil.DEFAULT_FONT_COLOR);
        }
    }

    /** One line of text, shrunk until it fits `maxWidth`. */
    private static void fitLine(PdfContentByte canvas, String text, int align, float x, float baseline,
                                float maxWidth, float size, BaseColor color) {
        Font font = FontUtil.getMacedonianFont(size, color);
        while (size > 6 && font.getBaseFont() != null
                && font.getBaseFont().getWidthPoint(text, size) > maxWidth) {
            size -= 0.5f;
            font = FontUtil.getMacedonianFont(size, color);
        }
        ColumnText.showTextAligned(canvas, align, new Phrase(text, font), x, baseline, 0);
    }

    /** A white disc over the template's logo, with the clinic's logo fitted inside. */
    private static void logo(PdfContentByte canvas, String path, float cx, float cy, float coverRadius, float imageRadius) {
        Image image;
        try {
            image = Image.getInstance(path);
        } catch (Exception e) {
            logger.warning("Clinic logo could not be read (" + path + "): " + e.getMessage());
            return;
        }
        try {
            canvas.saveState();
            canvas.setColorFill(BaseColor.WHITE);
            canvas.circle(cx, cy, coverRadius);
            canvas.fill();
            canvas.restoreState();
            image.scaleToFit(imageRadius * 2, imageRadius * 2);
            image.setAbsolutePosition(cx - image.getScaledWidth() / 2, cy - image.getScaledHeight() / 2);
            canvas.addImage(image);
        } catch (Exception e) {
            logger.warning("Clinic logo could not be drawn: " + e.getMessage());
        }
    }
}
