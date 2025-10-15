package com.vetclinic.pdf;

import com.vetclinic.pdf.constants.Constants;
import com.itextpdf.text.*;
import com.itextpdf.text.pdf.*;
import com.itextpdf.text.pdf.draw.VerticalPositionMark;

import java.io.*;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Date;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;

public class Util {

    public static final BaseColor DEFAULT_BORDER_COLOR = BaseColor.LIGHT_GRAY;
    // CYAN_COLOR = #7fCBC4;
    // light version 1: #b1fef7
    // light version 2: #caffff
    // font dark version 1: #63c1b9
    public static final BaseColor CYAN_DARK_COLOR = new BaseColor(99, 193, 185);
    public static final BaseColor DARK_GRAY_COLOR = new BaseColor(186, 189, 190);
    public static final BaseColor CYAN_COLOR = new BaseColor(127, 203, 196);
    public static final BaseColor RED_COLOR = new BaseColor(250, 128, 114);
    public static final BaseColor LIGHT_GRAY_COLOR = new BaseColor(236 , 239 , 241);
    private static Logger logger = Logger.getLogger(Util.class.getName());

    public static LocalDate parseDateStringRepresentation(String date) {

//            Date dateOfBirthObj = DateUtils.parseDate(date, Constants.DATE_PATTERN);
//            Instant instant = dateOfBirthObj.toInstant();
//            LocalDate localDate = instant.atZone(ZoneId.systemDefault()).toLocalDate();
        if (date == null || date.isEmpty()) {
            return null;
        }

        try {
            DateTimeFormatter dateTimeFormatter = DateTimeFormatter.ofPattern(Constants.DATE_PATTERN);
            return LocalDate.parse(date, dateTimeFormatter);
        } catch (DateTimeParseException ex) {
            logger.info("[DateTimeParseException] String representation of " + date + " cannot be parsed" );
            return null;
        }
    }

    public static String formatDate(LocalDate date) {
        if (date == null) {
            return "";
        }
        DateTimeFormatter dateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        return date.format(dateTimeFormatter);
    }

    private static void hideFile(Path path, boolean toHide) {
        try {
            Files.setAttribute(path, "dos:hidden", toHide, LinkOption.NOFOLLOW_LINKS);
        } catch (IOException e) {
            String errorMessage = "File " + path.toAbsolutePath() +
                    ((toHide) ? " cannot be hidden" : " cannot be set to viewable");
            Logger.getAnonymousLogger().info(errorMessage);
        }
    }

    public static void makeFileHidden(Path path) {
        hideFile(path, true);
    }

    public static void makeFileViewable(Path path) {
        hideFile(path, false);
    }


    public static void setResource(String resource, String value) {

        try {

            URL configUrl = Util.class.getResource("config.properties");
            if (configUrl == null) {
                logger.severe("Path to config.properties cannot be found");
                return;
            }

            File file = Paths.get(configUrl.toURI()).toFile();
            FileInputStream in = new FileInputStream(file);
            Properties props = new Properties();
            props.load(in);
            in.close();

            FileOutputStream out = new FileOutputStream(file);
            if (value != null) {
                value = value.trim();
            }
            props.setProperty(resource, value);
            props.store(out, null);
            out.flush();
            out.close();

            logger.info("Resource [key: " + resource + ", value: " + value + "] is set");
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        } catch (URISyntaxException e) {
            e.printStackTrace();
        }
    }

    public static String getResource(String resource) {

        String value = "";

        try {

            String configRelativePath = "config.properties";
            URL configUrl = Util.class.getResource(configRelativePath);
            if (configUrl == null) {
                logger.severe("Path to config url cannot be found");
                // TODO: Should throw an error
                return "";
            }

// [comment] changed because of jar packaging which gives errors if it is done with FileInputStream way
//            File file = Paths.get(configUrl.toURI()).toFile();
//            FileInputStream in = new FileInputStream(file);
            InputStream in = Util.class.getResourceAsStream(configRelativePath);
            Properties props = new Properties();
            props.load(in);
            value = props.getProperty(resource);
            in.close();

        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
//        catch (URISyntaxException e) {
//            e.printStackTrace();
//        }

        if (value != null) {
            value = value.trim();
        }
        return value;
    }

    public static String getResultsFilenameByDate(LocalDate date) {

        int month = date.getMonthValue();
        int day = date.getDayOfMonth();

        int year = date.getYear();

        String generatedFilename = Constants.STATIC_XML_FILE_NAME +
                year + "-" +
                ((month < 10) ? ("0" + month) : (month))
                + "-" +
                ((day < 10) ? ("0" + day) : (day))
                + ".xml";

        return generatedFilename;
    }

    public static String getCurrentFormattedDate() {
        Date date = new Date();
        SimpleDateFormat simpleDateFormat = new SimpleDateFormat(Constants.DATE_PATTERN);
        return simpleDateFormat.format(date);
    }

    public static String getCurrentFormattedDateAndTime() {
        Date date = new Date();
        SimpleDateFormat simpleDateFormat = new SimpleDateFormat("dd-MM-yyyy-HHmmss");
        return simpleDateFormat.format(date);
    }

    // NOTE: Removed getFormattedDateAndTime method - not used in PDF generation

    public static String getAbsolutePath(String resourcePathRelativeToMainPackage) {
        URL resource = Util.class.getResource(resourcePathRelativeToMainPackage);
        if (resource == null) {
            logger.severe("Relative path " + resourcePathRelativeToMainPackage + " not found");
            // TODO: throw exception or put normal font
            return "";
        }

        try {
            URI uri = resource.toURI();
            return uri.toString();
        } catch (URISyntaxException e) {
            logger.log(Level.SEVERE, e.getMessage(), e.getCause());
        }

        return "";
    }

    public static void maskHelperRectangleAndAddToCanvas(Rectangle rectangle, PdfContentByte canvas) {
        rectangle.setBorder(Rectangle.BOX);
        rectangle.setBorderWidth(0.5f);
        rectangle.setBorderColor(BaseColor.RED);

        canvas.rectangle(rectangle);
    }

    public static PdfPTable createBorderlessTable(int columns) {
        PdfPTable table = new PdfPTable(columns);
        table.getDefaultCell().setBorder(0);
        table.setWidthPercentage(100.0f);
        return table;
    }

    public static PdfPCell createBorderlessCell() {
        PdfPCell cell = new PdfPCell();
        cell.setBorder(PdfPCell.NO_BORDER);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        return cell;
    }

    public static PdfPHeaderCell createBorderlessHeaderCell() {
        PdfPHeaderCell cell = new PdfPHeaderCell();
        cell.setBorder(PdfPCell.NO_BORDER);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        return cell;
    }

    public static PdfPCell createBorderlessCell(String text, int fontSize, int language) {
       return createBorderlessCell(text, fontSize, language, FontUtil.DEFAULT_FONT_COLOR, null);
    }

    public static PdfPCell createBorderlessCell(String text, int fontSize, int language,
                                                BaseColor fontColor, BaseColor backgroundColor) {
        PdfPCell cell = new PdfPCell();
        cell.setBorder(PdfPCell.NO_BORDER);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        if (backgroundColor != null) {
            cell.setCellEvent((cell1, position, canvases) -> {
                float x1 = position.getLeft() + 5;
                float x2 = position.getRight() - 5;
                float y1 = position.getTop();
                float y2 = position.getBottom();
                PdfContentByte canvas = canvases[PdfPTable.BACKGROUNDCANVAS];
                canvas.rectangle(x1, y1, x2 - x1, y2 - y1);
                canvas.setColorFill(backgroundColor);
                canvas.setColorStroke(backgroundColor);
                canvas.fillStroke();
            });
        }
        return addTextToCell(text, fontSize, language, null, cell, PdfPCell.ALIGN_CENTER, fontColor);
    }

    public static PdfPCell createDefaultCell(String text, int fontSize, int language) {
        return createDefaultCell(text, fontSize, language, PdfPCell.ALIGN_LEFT);
    }

    public static PdfPCell createDefaultCell(String text, int fontSize, int language, int horizontalAlignment,
                                             BaseColor fontColor) {
       return createDefaultCell(text, fontSize, language, null, horizontalAlignment, fontColor, DEFAULT_BORDER_COLOR);
    }

    public static PdfPCell createDefaultCellWithItalics(String text, int fontSize, int language,
                                             int horizontalAlignment, BaseColor fontColor, BaseColor borderColor) {
        PdfPCell cell = new PdfPCell();
        cell.disableBorderSide(Rectangle.LEFT);
        cell.disableBorderSide(Rectangle.TOP);
        cell.disableBorderSide(Rectangle.RIGHT);
        cell.setBorderColor(borderColor);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        cell.setPaddingTop(4);
        cell.setPaddingBottom(4);
        return addTextToCell(text, fontSize, language, Font.FontStyle.ITALIC, cell, horizontalAlignment, fontColor);
    }

    public static PdfPCell createDefaultCell(String text, int fontSize, int language,
                                             int horizontalAlignment, BaseColor fontColor, BaseColor borderColor) {
        return createDefaultCell(text, fontSize, language, null, horizontalAlignment,
                fontColor, borderColor);
    }


    public static PdfPCell createDefaultCell(String text, int fontSize, int language, Font.FontStyle fontStyle,
                                             int horizontalAlignment, BaseColor fontColor, BaseColor borderColor) {
        PdfPCell cell = new PdfPCell();
        cell.disableBorderSide(Rectangle.LEFT);
        cell.disableBorderSide(Rectangle.TOP);
        cell.disableBorderSide(Rectangle.RIGHT);
        cell.setBorderColor(borderColor);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        cell.setPaddingTop(4);
        cell.setPaddingBottom(4);
        return addTextToCell(text, fontSize, language, fontStyle, cell, horizontalAlignment, fontColor);
    }

    public static PdfPCell createDefaultCell(String text, int fontSize, int language, int horizontalAlignment) {
       return createDefaultCell(text, fontSize, language, null, horizontalAlignment, FontUtil.DEFAULT_FONT_COLOR, DEFAULT_BORDER_COLOR);
    }

    public static PdfPHeaderCell createDefaultHeaderCell(String text, int fontSize, int language,
                                                         BaseColor fontColor, BaseColor backgroundColor) {
        PdfPHeaderCell cell = new PdfPHeaderCell();
        cell.setBorder(PdfPCell.NO_BORDER);
        cell.setBackgroundColor(backgroundColor);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        return addTextToCell(text, fontSize, language, cell, PdfPCell.ALIGN_CENTER, fontColor);
    }

    public static PdfPHeaderCell createDefaultHeaderCell(String text, int fontSize, int language) {
        PdfPHeaderCell cell = new PdfPHeaderCell();
        cell.setBorder(PdfPCell.NO_BORDER);
        cell.setBackgroundColor(Util.LIGHT_GRAY_COLOR);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        return addTextToCell(text, fontSize, language, cell, PdfPCell.ALIGN_CENTER, FontUtil.DEFAULT_FONT_COLOR);
    }

    public static PdfPCell createBorderedCell(String text, int fontSize, int language, int horizontalAlignment,
                                             BaseColor fontColor, BaseColor borderColor) {
        PdfPCell cell = new PdfPCell();
        cell.setBorderColor(borderColor);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        return addTextToCell(text, fontSize, language, null, cell, horizontalAlignment, fontColor);
    }

    public static void enableBorders(PdfPCell cell) {
        cell.enableBorderSide(Rectangle.LEFT);
        cell.enableBorderSide(Rectangle.RIGHT);
        cell.enableBorderSide(Rectangle.TOP);
        cell.enableBorderSide(Rectangle.BOTTOM);
    }

    public static void disableBorders(PdfPCell cell) {
        cell.disableBorderSide(Rectangle.LEFT);
        cell.disableBorderSide(Rectangle.RIGHT);
        cell.disableBorderSide(Rectangle.TOP);
        cell.disableBorderSide(Rectangle.BOTTOM);
    }

    /**
     * @param text
     * @param fontSize
     * @param language example: FontUtil.MACEDONIAN
     * */
    public static PdfPCell createCellWithRightBorderOnly(String text, int fontSize, int language) {

        PdfPCell cell = new PdfPCell();
        cell.setBorderColor(DEFAULT_BORDER_COLOR);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        cell.disableBorderSide(PdfPCell.RIGHT);

        return addTextToCell(text, fontSize, language, cell, PdfPCell.ALIGN_LEFT);
    }

    public static PdfPCell createDefaultCellWithLeftRightAlignment(String leftText, String rightText, int fontSize, int language) {

        PdfPCell cell = new PdfPCell();
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        cell.setBorderColor(DEFAULT_BORDER_COLOR);
        cell.disableBorderSide(Rectangle.LEFT);
        cell.disableBorderSide(Rectangle.TOP);
        cell.disableBorderSide(Rectangle.RIGHT);
        return addTextToCellLeftRightAlignment(leftText, rightText, fontSize, language, cell);
    }

    private static PdfPCell addTextToCell(String text, int fontSize, int language,
                                          Font.FontStyle fontStyle,
                                          PdfPCell cell, int horizontalAlignment,
                                          BaseColor fontColor) {

        Font font = null;
        switch (language) {
            case FontUtil.MACEDONIAN: {
                font = FontUtil.getMacedonianFont(fontSize, fontColor);
                if (fontStyle != null) {
                    font.setStyle(fontStyle.getValue());
                }
                break;
            }
            default: {
                // TODO: throw ex
            }
        }

        if (font == null) {
            // TODO: throw ex
            return null;
        }

        Paragraph wrapper =  new Paragraph(text, font);
        wrapper.setAlignment(horizontalAlignment);

        cell.addElement(wrapper);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        cell.setUseAscender(true);
        cell.setUseDescender(true);

        return cell;
    }


    // TODO: map my alignments with iText ones, since they can change them up
    // depending if its for paragraph or PdfPCell
    // for now they are the same;
    private static PdfPCell addTextToCell(
            String text,
            int fontSize,
            int language,
            PdfPCell cell,
            int horizontalAlignment) {

        return addTextToCell(text, fontSize, language, null, cell, horizontalAlignment, FontUtil.DEFAULT_FONT_COLOR);
    }


    // Note: cell is being returned for convenience reasons only
    private static PdfPHeaderCell addTextToCell(
            String text,
            int fontSize,
            int language,
            PdfPHeaderCell cell,
            int horizontalAlignment) {

        return addTextToCell(text, fontSize, language, cell, horizontalAlignment, FontUtil.DEFAULT_FONT_COLOR);
    }

    private static PdfPHeaderCell addTextToCell(
            String text,
            int fontSize,
            int language,
            PdfPHeaderCell cell,
            int horizontalAlignment,
            BaseColor fontColor) {

        Font font = null;
        switch (language) {
            case FontUtil.MACEDONIAN: {
                font = FontUtil.getMacedonianFont(fontSize, fontColor);
                break;
            }
            default: {
                // TODO: throw ex
            }
        }

        if (font == null) {
            // TODO: throw ex
            return null;
        }

        Paragraph wrapper =  new Paragraph(text, font);
//        Chunk chunk = new Chunk(text, font);
//        chunk.setCharacterSpacing(2);
        wrapper.setKeepTogether(true);
        wrapper.setLeading(8);
        wrapper.setAlignment(horizontalAlignment);
//        wrapper.add(chunk);

        cell.addElement(wrapper);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        cell.setUseAscender(true);
        cell.setUseDescender(true);


        return cell;
    }

    private static PdfPCell addTextToCellLeftRightAlignment(
            String leftText,
            String rightText,
            BaseColor leftColor,
            BaseColor rightColor,
            int fontSize,
            int language,
            PdfPCell cell) {

        Font leftFont = null;
        Font rightFont = null;
        switch (language) {
            case FontUtil.MACEDONIAN: {
                leftFont = FontUtil.getMacedonianFont(fontSize, leftColor);
                rightFont = FontUtil.getMacedonianFont(fontSize, rightColor);
                break;
            }
            default: {
                // TODO: throw ex
            }
        }

        if (leftFont == null || rightFont == null) {
            // TODO: throw ex
            return null;
        }

        Chunk glue = new Chunk(new VerticalPositionMark());
        Chunk leftTextChunk = new Chunk(leftText, leftFont);
        Chunk rightTextChunk = new Chunk(rightText, rightFont);
        Paragraph wrapper = new Paragraph(leftTextChunk);
        wrapper.add(new Chunk(glue));
        wrapper.add(rightTextChunk);

        cell.addElement(wrapper);
        cell.setVerticalAlignment(PdfPCell.ALIGN_MIDDLE);
        cell.setUseAscender(true);
        cell.setUseDescender(true);

        return cell;
    }

    private static PdfPCell addTextToCellLeftRightAlignment(
            String leftText,
            String rightText,
            int fontSize,
            int language,
            PdfPCell cell) {

        return addTextToCellLeftRightAlignment(leftText, rightText, FontUtil.DEFAULT_FONT_COLOR,
                FontUtil.DEFAULT_FONT_COLOR, fontSize, language, cell);
    }

    public static PdfPCell createBorderlessLeftSideCell(String text, int fontSize, int language) {
        PdfPCell cell = new PdfPCell();
        cell.disableBorderSide(PdfPCell.LEFT);

        return addTextToCell(text, fontSize, language, cell, PdfPCell.ALIGN_RIGHT);
    }

    public static PdfPCell createCellWithRightBorderOnly(BaseColor borderColor) {
        PdfPCell cell = new PdfPCell();
        cell.disableBorderSide(Rectangle.LEFT);
        cell.disableBorderSide(Rectangle.TOP);
        cell.disableBorderSide(Rectangle.BOTTOM);
        cell.setBorderColor(borderColor);
        return cell;
    }

    public static PdfPCell createCellWithLeftBorderOnly(BaseColor borderColor) {
        PdfPCell cell = new PdfPCell();
        cell.disableBorderSide(Rectangle.RIGHT);
        cell.disableBorderSide(Rectangle.TOP);
        cell.disableBorderSide(Rectangle.BOTTOM);
        cell.setBorderColor(borderColor);
        return cell;
    }

    // NOTE: Removed JavaFX UI methods - not used in PDF generation
    // - makeColumnHeaderTextWrapped
    // - setNumbersOnlyPropertyToTextField

    public static boolean createWorkDirectoryIfNonExistent() throws ClassNotFoundException {
        Class.forName("org.sqlite.JDBC");
        String home =  System.getProperty("user.home");
        File workDirectory = new File(home + "/" + Constants.HIDDEN_WORK_DIR);
        if (!workDirectory.exists()) {
            boolean isWorkDirCreated = workDirectory.mkdir();
            if (isWorkDirCreated) {
                logger.info("Work directory " + Constants.HIDDEN_WORK_DIR + " is created");
            } else {
                logger.severe("Work directory " + Constants.HIDDEN_WORK_DIR + " cannot be created");
            }
            return isWorkDirCreated;
        }
        return true;
    }

    private Util() {

    }



}
