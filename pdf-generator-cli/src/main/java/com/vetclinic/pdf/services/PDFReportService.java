package com.vetclinic.pdf.services;

import com.vetclinic.pdf.FontUtil;
import com.vetclinic.pdf.Util;
import com.vetclinic.pdf.constants.Constants;
import com.vetclinic.pdf.constants.Content;
import com.vetclinic.pdf.constants.PatientType;
import com.vetclinic.pdf.constants.Indicator;
import com.vetclinic.pdf.exceptions.CreatingDirectoryException;
import com.vetclinic.pdf.exceptions.GeneratingPDFReportException;
import com.vetclinic.pdf.exceptions.TablesCannotFitPageException;
import com.vetclinic.pdf.models.Patient;
import com.vetclinic.pdf.models.parameters.Parameter;
import com.vetclinic.pdf.models.samples.ExigoSample;
import com.vetclinic.pdf.models.samples.HealvetSample;
import com.vetclinic.pdf.models.samples.PointcareSample;
import com.vetclinic.pdf.models.samples.Sample;
import com.itextpdf.text.*;
import com.itextpdf.text.Font;
import com.itextpdf.text.Image;
import com.itextpdf.text.Rectangle;
import com.itextpdf.text.pdf.*;
import com.itextpdf.text.pdf.draw.LineSeparator;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;


public class PDFReportService {

    private static PDFReportService instance;
    private static final int CELL_FONT_SIZE = 10;
    private static final int HEADER_FONT_SIZE = 8;
    private static final int SMALL_FONT_SIZE = 8;
    private static final int SMALL_INFO_FONT_SIZE = 10;
    private static Logger logger;

    static {
        try {
            logger = Logger.getLogger(PDFReportService.class.getName());
            instance = new PDFReportService();
        } catch (Exception e) {
            throw new RuntimeException("Exception occurred in creating singleton instance");
        }
    }

    public File createPDFReport(Patient patient, List<Sample> samples, String outputPath)
            throws CreatingDirectoryException, IOException, DocumentException, GeneratingPDFReportException {
        return createPDFImpl(patient, samples, outputPath);
    }

    private PdfPTable getTable(int i) {

        PdfPTable table = new PdfPTable(2);
        for (int j = 0; j < 10; j++) {
            table.addCell("hello");
            table.addCell(String.valueOf(j));
        }

        return table;
    }

    private void generateReport(Document document,
                                PdfWriter writer,
                                Patient patient,
                                List<Sample> samples)
            throws DocumentException, IOException, GeneratingPDFReportException {

        float headerHeight = generateHeader(document, writer);
        float titleHeight = generateTitleLine(document);
        float tablesHeight = 0;
        try {
            tablesHeight = generateTables(document, patient, samples);
        } catch (TablesCannotFitPageException e) {
            // nothing was added to the table, regenerateTables only this time two, and then
            // make another page .
            logger.info("Tables are too large to fit all in one page");

            // by the way we configured things earlier this will be removed for sure
            // there should be smarter way to do this but I'm lazy.
            if (samples.size() != 3) {
                logger.severe("There is something wrong with the logic, if tables are too large " +
                        "for one page to fit, there should be three tables");
            }
            HealvetSample healvetSample = null;
            int indexToRemove = -1;
            for (int i = 0; i < samples.size(); i++) {
                Sample sample = samples.get(i);
                if (sample instanceof HealvetSample) {
                    healvetSample = (HealvetSample) sample;
                    indexToRemove = i;
                }
            }
            if (healvetSample == null) {
                logger.severe("There is something wrong with the logic, there should be at least one Healvet" +
                        " sample when the case is that tables are too large to fit one page");
                return;
            }

            try {

                if (indexToRemove != -1) {
                    samples.remove(indexToRemove);
                } else {
                    logger.info("Sample index to remove is -1 ... some logic error happened");
                }

                float twoTablesOnlyHeight = generateTables(document, patient, samples);
                float contentHeight = headerHeight + titleHeight + twoTablesOnlyHeight;
                generateFooter(document, writer, contentHeight);

                logger.info("First page generated");
                document.newPage();
                logger.info("Added new page");

                List<Sample> healvetSampleList = new ArrayList<>();
                healvetSampleList.add(healvetSample);
                generateReport(document, writer, patient, healvetSampleList);
                return;

            } catch (TablesCannotFitPageException ex) {
                logger.severe("Undefined behaviour: Two tables shouldn't be too large to fit one page.");
                return;
            }
        }

        // continuation for regular tables
        float contentHeight = headerHeight + titleHeight + tablesHeight;
        generateFooter(document, writer, contentHeight);
    }

    // Alignment in PdfPCell is ignored when in composite mode, only alignment in the element itself is used
    private void generateFooter(Document document, PdfWriter writer, float contentHeight) throws DocumentException, IOException {

        float pageHeight = writer.getPageSize().getHeight();

        // line paragraph
        LineSeparator lineSeparator = createLine();

        Paragraph lineParagraph = new Paragraph();
        lineParagraph.add(lineSeparator);


        // socials paragraph (right)
        Image socialsImages = Image.getInstance(Util.getAbsolutePath(Constants.SOCIALS));
        socialsImages.scaleToFit(35, 35);
        Chunk socialsImagesChunk = new Chunk(socialsImages, 0, -8, false);
        Paragraph socialImagesParagraph = new Paragraph();
        socialImagesParagraph.setAlignment(Element.ALIGN_RIGHT);
        socialImagesParagraph.add(socialsImagesChunk);

        Chunk socials = new Chunk( Content.SOCIALS,
                FontUtil.getMacedonianFont(CELL_FONT_SIZE, FontUtil.DEFAULT_FONT_COLOR));
        Paragraph socialsParagraph = new Paragraph();
        socialsParagraph.setAlignment(Element.ALIGN_RIGHT);
        socialsParagraph.setIndentationRight(20);
        socialsParagraph.add(socials);

        PdfPTable socialsWrapper = Util.createBorderlessTable(2);
        float[] socialsColumnWidths = {
                60,
                40
        };
        socialsWrapper.setTotalWidth(socialsColumnWidths);
        PdfPCell socialsImagesWrapper = Util.createBorderlessCell();

        socialsImagesWrapper.setHorizontalAlignment(Rectangle.RIGHT);
        socialsImagesWrapper.addElement(socialImagesParagraph);


        PdfPCell socialsTextWrapper = Util.createBorderlessCell();
        socialsTextWrapper.addElement(socialsParagraph);

        socialsWrapper.addCell(socialsImagesWrapper);
        socialsWrapper.addCell(socialsTextWrapper);

        // website paragraph (left)
        Paragraph websiteParagraph = new Paragraph();
        websiteParagraph.setIndentationLeft(20);

        Chunk website = new Chunk(
                Content.WEBSITE,
                FontUtil.getMacedonianFont(CELL_FONT_SIZE, FontUtil.DEFAULT_FONT_COLOR));
        websiteParagraph.add(website);

        // adding everything to the wrapper
        PdfPTable wrapper = Util.createBorderlessTable(3);
        float[] columnWidths = {
                40,
                20,
                40
        };
        wrapper.setWidths(columnWidths);
        wrapper.setSpacingBefore(20);

        PdfPCell webSiteCell = Util.createBorderlessCell();
        webSiteCell.addElement(websiteParagraph);

        PdfPCell socialsCell = Util.createBorderlessCell();
        socialsCell.addElement(socialsWrapper);

        wrapper.addCell(webSiteCell);
        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(socialsCell);


        logger.info("Get page height: " + pageHeight);
        logger.info("Get content so far: " + contentHeight);
        float footerHeight = 60; // more or less
        float spaceWithoutFooter = pageHeight - contentHeight;
        float spaceBeforeFooter = 0;
        if (spaceWithoutFooter > footerHeight) {
            spaceBeforeFooter = spaceWithoutFooter - footerHeight;
        }

        lineParagraph.setSpacingBefore(spaceBeforeFooter);
        document.add(lineParagraph);
        document.add(wrapper);
    }

    private float generateTitleLine(Document document) throws DocumentException {

        PdfPTable wrapper = Util.createBorderlessTable(3);
//        wrapper.setSpacingBefore(20);
        float[] columnWidths = {
                50,
                40,
                10
        };
        wrapper.setWidths(columnWidths);

        // left line
        PdfPCell leftLine = Util.createBorderlessCell();
        LineSeparator fullLine = createLine();
        leftLine.setPadding(0);
        leftLine.addElement(fullLine);

        wrapper.addCell(leftLine);

        // title
//        PdfPCell titleCell = Util.createBorderedCell("РЕЗУЛТАТИ ОД ЛАБОРАТОРИСКИ АНАЛИЗИ",
//                10, FontUtil.MACEDONIAN, PdfPCell.ALIGN_CENTER, FontUtil.DEFAULT_FONT_COLOR,
//                Util.CYAN_COLOR);
        PdfPCell titleCell = Util.createBorderlessCell("РЕЗУЛТАТИ ОД ЛАБОРАТОРИСКИ АНАЛИЗИ",
                11, FontUtil.MACEDONIAN);

        wrapper.addCell(titleCell);

        // right line
        PdfPCell rightLine = Util.createBorderlessCell();
        rightLine.addElement(fullLine);
        rightLine.setPadding(0);
        wrapper.addCell(rightLine);

        document.add(wrapper);
        return wrapper.getTotalHeight();
    }

    private LineSeparator createLine() {
        LineSeparator fullLine = new LineSeparator();
        fullLine.setLineColor(Util.CYAN_COLOR);
        fullLine.setLineWidth(1f);
        fullLine.setPercentage(100f);
        return fullLine;
    }

    // Samples Will always be sent in order Exigo, Pointcare, Healvet
    private float generateTables(Document document, Patient patient, List<Sample> samples)
            throws DocumentException, IOException, GeneratingPDFReportException, TablesCannotFitPageException {

        if (samples.size() > 3 || samples.size() < 1) {
            throw new GeneratingPDFReportException("Samples size is " + samples.size() + "" +
                    " so PDF Report cannot be created. There must be 1, 2 or 3 samples in order to create " +
                    "a report");
        }

        boolean isExigoSampleFilled = false, isPointcareSampleFilled = false, isHealvetSampleFilled = false;
        PdfPTable layout = new PdfPTable(2);
        layout.setWidthPercentage(100.0f);
        float[] columnWidths = {
                50, 50
        };
        layout.setWidths(columnWidths);
        layout.getDefaultCell().setBorder(0);
        layout.setComplete(true);

        PdfPTable leftLayout = new PdfPTable(1);
        PdfPTable rightLayout = new PdfPTable(1);
        // if only one sample aka table then put it in the center ...

        PdfPCell leftDownCell = null;
        PdfPCell rightUpCell = null;
        PdfPCell rightDownCell = null;

        for (int i = 0; i < samples.size(); i++) {
            Sample sample = samples.get(i);

            if (sample instanceof ExigoSample) {
                //System.out.println("Sample instance of Exigo Sample - RUC");
                // Exigo will always have the rightUpCell reserved for displaying info
                rightUpCell = generateExigoSampleTable((ExigoSample) sample);
                isExigoSampleFilled = true;
                continue;
            }

            if (sample instanceof PointcareSample) {
                if (samples.size() == 1) {
                    //System.out.println("Sample instance of Pointcare Sample - RUC ");
                    rightUpCell = generatePointcareSampleTable((PointcareSample) sample);
                } else if (samples.size() == 2) {
                    if (rightUpCell != null) {
                        //System.out.println("Sample instance of Pointcare Sample - LDC ");
                        leftDownCell = generatePointcareSampleTable((PointcareSample) sample);
                    } else {
                        //System.out.println("Sample instance of Pointcare Sample - RUC ");
                        rightUpCell = generatePointcareSampleTable((PointcareSample) sample);
                    }
                } else if (samples.size() == 3) {
                    //System.out.println("Sample instance of Pointcare Sample - LDC ");
                    leftDownCell = generatePointcareSampleTable((PointcareSample) sample);
                }
                isPointcareSampleFilled = true;
                continue;
            }

            if (sample instanceof HealvetSample) {
                if (samples.size() == 1) {
                    //System.out.println("Sample instance of Healvet Sample - RUC ");
                    rightUpCell = generateHealvetSampleTable((HealvetSample) sample);
                } else if (samples.size() == 2) {
                   // System.out.println("Sample instance of Healvet Sample - LDC ");
                    leftDownCell = generateHealvetSampleTable((HealvetSample) sample);
                } else if (samples.size() == 3) {
                    //System.out.println("Sample instance of Healvet Sample - RDC ");
                    rightDownCell = generateHealvetSampleTable((HealvetSample) sample);
                }
                isHealvetSampleFilled = true;
            }
        }

        boolean isOnlyOneTableBeingGenerated = leftDownCell == null && rightDownCell == null;

        // PATIENT INFO TABLE
        PdfPCell leftUpCell = generatePatientInfoTable(patient, isOnlyOneTableBeingGenerated);
        leftUpCell.setPaddingLeft(20);
        int paddingTopForContent = 30;
//        leftUpCell.setPaddingTop(paddingTopForContent);
        leftUpCell.setPaddingBottom(20);

        setTopAlignmentToAllCells(leftUpCell, leftDownCell, rightUpCell, rightDownCell);


        leftUpCell.setPaddingTop(paddingTopForContent);
        leftLayout.addCell(leftUpCell);

        if (leftDownCell != null) {
            leftDownCell.setPaddingTop(20);
            leftLayout.addCell(leftDownCell);
        }

        if (rightUpCell != null) {
            rightUpCell.setPaddingTop(paddingTopForContent - 2);
            rightUpCell.setPaddingRight(10);
            rightUpCell.setPaddingBottom(20);
            if (rightDownCell != null || leftDownCell != null) {
                rightLayout.addCell(rightUpCell);
            }
        }

        if (rightDownCell != null) {
            rightDownCell.setPaddingRight(10);
            rightLayout.addCell(rightDownCell);
            // since this is the only problematic table aka if the healvet table is too big (too many params
            // have been chosen) then we will have overload of tables, so we will check the possible height
            // of the right layout before we add the rightDownCell. If the height is bigger then the
            // maximum height a rightLayout can have, then we will set a flag that new page should be created;
            float rightLayoutWidthToBe = PageSize.A4.getWidth() / 2;
            rightLayout.setTotalWidth(rightLayoutWidthToBe);
            float rightLayoutHeightToBe = rightLayout.getTotalHeight();
            System.out.println("RIGHT LAYOUT HEIGHT TO BE: " + rightLayoutHeightToBe);
            if (rightLayoutHeightToBe > 673) {
                // put the rightDown table (because this is the only case this layout will be so big in height)
                // on the next page
                System.out.println("Put right down table aka healvet table to the next page");
                throw new TablesCannotFitPageException();
            }
        }

        if (isOnlyOneTableBeingGenerated) {
            System.out.println(" ----------------------- only one sample is chosen and the table is not added " +
                    "to the rightLayout - add empty cell to the rightUp cell");
            rightLayout.addCell(Util.createBorderlessCell());
        }

        layout.addCell(leftLayout);
        layout.addCell(rightLayout);

        try {
            if (isOnlyOneTableBeingGenerated) {
                PdfPTable wrapperForTheOnlyTable = new PdfPTable(1);
                // renaming solely for better understanding of the code
                PdfPCell patientCell = leftUpCell;
                PdfPCell sampleCell = rightUpCell;

                // this is to undone the left padding - can be done better but lazy now yeah.
                patientCell.setPaddingLeft(0);
                if (sampleCell == null) {
                    logger.severe("Right up cell cannot be null - this is the only table for the PDF Report");
                    throw new GeneratingPDFReportException("No sample for displaying to the report");
                }
                if (isExigoSampleFilled || isPointcareSampleFilled) {
                    sampleCell.setPaddingTop(40);
                    patientCell.setPaddingTop(50);
                    sampleCell.setPaddingLeft(50);
                } else if (isHealvetSampleFilled) {
                    patientCell.setPaddingTop(60);
                    sampleCell.setPaddingTop(50);
                    sampleCell.setPaddingLeft(40);
                }

                sampleCell.setPaddingRight(50);

                wrapperForTheOnlyTable.addCell(patientCell);
                wrapperForTheOnlyTable.addCell(sampleCell);
                wrapperForTheOnlyTable.setHorizontalAlignment(Element.ALIGN_CENTER);
                wrapperForTheOnlyTable.setWidthPercentage(70);

                document.add(wrapperForTheOnlyTable);
//                return layout.getTotalHeight() + wrapperForTheOnlyTable.getTotalHeight();
                return wrapperForTheOnlyTable.getTotalHeight();

            }

            document.add(layout);
            return layout.getTotalHeight();
        } catch (DocumentException e) {
            e.printStackTrace();
        }

        return -1;
    }

    private void setTopAlignmentToAllCells(PdfPCell... cells) {
        for (PdfPCell cell :
                cells) {
            if (cell != null) {
                cell.setVerticalAlignment(Element.ALIGN_TOP);
            }
        }
    }

    private PdfPCell generateHealvetSampleTable(HealvetSample sample) throws DocumentException {

        PdfPTable table = Util.createBorderlessTable(5);
        float[] columnWidths = {
                8,
                30,
                14,
                12,
                36
        };
        table.setWidths(columnWidths);

        PdfPTable headers = createHeaderRowForResultsTable(columnWidths);

        List<Parameter> parameters = sample.getParameters();
        int rowIndex = 0;
        for (Parameter parameter :
                parameters) {

//            System.out.println("Parameter is:  " + parameter);
            table.addCell(Util.createBorderlessCell());
            table.addCell(createParameterCell(parameter.getName()));
//            System.out.println("parameter indicator: " + parameter.getIndicator());
            if (parameter.getIndicator().equals(Indicator.NORMAL)) {
                table.addCell(createOkayResultCell(String.valueOf(parameter.getResult())));
            } else {
                table.addCell(createBadResultCell(String.valueOf(parameter.getResult())));
            }
            table.addCell(createParameterCell(parameter.getUnit()));
            table.addCell(createParameterCell(parameter.getReferentValues()));
        }

        PdfPTable sampleInfoWrapperTable = createHealvetSampleInfoMiniTable(sample);

        PdfPCell titleCell = createTableTitle("Квантитативна анализа со техника на имунофлуоресценција");
        PdfPTable wrapper = Util.createBorderlessTable(1);
        wrapper.addCell(titleCell);
        wrapper.addCell(headers);
        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(table);
        wrapper.addCell(sampleInfoWrapperTable);

        PdfPCell cellWrapper = Util.createBorderlessCell();
        cellWrapper.addElement(wrapper);
        return cellWrapper;
    }

    private PdfPCell generatePointcareSampleTable(PointcareSample sample) throws DocumentException {

        PdfPTable table = Util.createBorderlessTable(5);
        float[] columnWidths = {
                8,
                33,
                17,
                17,
                25
        };
        table.setWidths(columnWidths);

        PdfPTable headers = createHeaderRowForResultsTable(columnWidths);

        List<Parameter> parameters = sample.getParameters();
        int rowIndex = 0;
        String theTitle = "БИОХЕМИЈА";
        int startingIndexForVerticalTitle = 3;
        int toAddRows = 0;
        if (parameters.size() < (theTitle.length() + startingIndexForVerticalTitle)) {
            startingIndexForVerticalTitle = 0;
            System.out.println("Parameters size: " + parameters.size());
            System.out.println("The title length: " + theTitle.length());
            if (parameters.size() < theTitle.length()) {
                toAddRows = theTitle.length() - parameters.size();
            }
        }

        for (Parameter parameter :
                parameters) {

            table.addCell(createResultsTableTitleCell(
                    theTitle, rowIndex++, startingIndexForVerticalTitle, parameters.size()));
            table.addCell(createParameterCell(parameter.getName()));
            if (parameter.getIndicator().equals(Indicator.NORMAL)) {
                table.addCell(createOkayResultCell(String.valueOf(parameter.getResult())));
            } else {
                table.addCell(createBadResultCell(String.valueOf(parameter.getResult())));
            }
            table.addCell(createParameterCell(parameter.getUnit()));
            table.addCell(createParameterCell(parameter.getReferentValues()));
        }

        if (toAddRows != 0) {
            System.out.println("Add "  + toAddRows + " rows.");
            for (int i = 0; i < toAddRows; i++) {
                table.addCell(createResultsTableTitleCell(
                        theTitle, rowIndex++, startingIndexForVerticalTitle, parameters.size()));
                table.addCell(Util.createBorderlessCell());
                table.addCell(Util.createBorderlessCell());
                table.addCell(Util.createBorderlessCell());
                table.addCell(Util.createBorderlessCell());
            }
        }

        PdfPTable sampleInfoWrapperTable = createPointcareSampleInfoMiniTable(sample);

        PdfPCell titleCell = createTableTitle(sample.getTestType().getTranslated());
        PdfPTable wrapper = Util.createBorderlessTable(1);
        wrapper.addCell(titleCell);
        wrapper.addCell(headers);
        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(table);
        wrapper.addCell(sampleInfoWrapperTable);

        PdfPCell cellWrapper = Util.createBorderlessCell();
        cellWrapper.addElement(wrapper);
        return cellWrapper;
    }

    private PdfPCell createTableTitle(String titleText) throws DocumentException {
        Font macedonianFont = FontUtil.getMacedonianFont(12, FontUtil.CYAN_DARK_FONT_COLOR);
        Chunk title = new Chunk(titleText, macedonianFont);
//        title.setCharacterSpacing(1);
        title.setBackground(Util.LIGHT_GRAY_COLOR);
        // TODO: [JUST IMPORTANT NOTE] THIS IS THE ONLY WAY I GOT TO ALIGN IT IN THE MIDDLE
        Paragraph titleParagraph = new Paragraph(title);
        titleParagraph.setAlignment(Paragraph.ALIGN_CENTER);
        PdfPCell titleCell = Util.createBorderlessCell();
        titleCell.addElement(titleParagraph);
        titleCell.setHorizontalAlignment(Element.ALIGN_CENTER);

        PdfPTable wrapper = Util.createBorderlessTable(2);
        float[] columnWidths = {
                8,
                92
        };
        wrapper.setWidths(columnWidths);

        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(titleCell);

        PdfPCell cellThatHoldsWrappedTable = Util.createBorderlessCell();
        cellThatHoldsWrappedTable.addElement(wrapper);
        cellThatHoldsWrappedTable.setPaddingTop(-24);

        return cellThatHoldsWrappedTable;
    }

    private PdfPCell generateExigoSampleTable(ExigoSample sample) throws IOException, DocumentException {

        PdfPTable table = Util.createBorderlessTable(5);
        float[] columnWidths = {
                8,
                33,
                17,
                17,
                25
        };
        table.setWidths(columnWidths);

        PdfPTable headers = createHeaderRowForResultsTable(columnWidths);

        List<Parameter> parameters = sample.getParameters();
        int rowIndex = 0;
        for (Parameter parameter :
                parameters) {

            // for Exigo we have enough parameters to actually start from index number 3
            // this is hard coded
            table.addCell(createResultsTableTitleCell(
                    "ХЕМАТОЛОГИЈА", rowIndex++, 3, parameters.size()));
            table.addCell(createParameterCell(parameter.getName()));
            if (parameter.getIndicator().equals(Indicator.NORMAL)) {
                table.addCell(createOkayResultCell(String.valueOf(parameter.getResult())));
            } else {
                table.addCell(createBadResultCell(String.valueOf(parameter.getResult())));
            }
            table.addCell(createParameterCell(parameter.getUnit()));
            table.addCell(createParameterCell(parameter.getReferentValues()));
        }

        PdfPTable sampleInfoWrapperTable = createExigoSampleInfoMiniTable(sample);

        PdfPTable wrapper = Util.createBorderlessTable(1);

        wrapper.addCell(headers);
        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(Util.createBorderlessCell());
        wrapper.addCell(table);
        wrapper.addCell(sampleInfoWrapperTable);

        PdfPCell cellWrapper = Util.createBorderlessCell();
        cellWrapper.addElement(wrapper);
        return cellWrapper;
    }

    private PdfPTable createHealvetSampleInfoMiniTable(HealvetSample sample) throws DocumentException {

        String sampleInfoText = "Примероци идентификациски броеви: " +
                sample.getSampleId();
//                " | " ;
//        if (sample.getSampleType() != null) {
//            sampleInfoText +=   " Тип на примерок: " +
//                    sample.getSampleType().getSampleTranslated() +
//                    " | ";
//        }
//
//        sampleInfoText += "Датум: " +
//        sample.getAnalysisDateAndTime() +
//        " | " +
//        "Пациент: " +
//        sample.getPatientId();

        return createSampleInfoTable(sampleInfoText);
    }

    private PdfPTable createPointcareSampleInfoMiniTable(PointcareSample sample) throws DocumentException {

        String sampleInfoText = "Примерок број: " +
                sample.getSampleId() +
                " | " +
                " Тип на примерок: " +
                sample.getSampleType().getSampleTranslated() +
                " | " +
                "Датум: " +
                sample.getAnalysisDateAndTime() +
                " | " +
                "Пациент: " +
                sample.getPatientId();
        return createSampleInfoTable(sampleInfoText);
    }

    private PdfPTable createExigoSampleInfoMiniTable(ExigoSample sample) throws DocumentException {

        String sampleInfoText = "Примерок број: " +
                sample.getSampleId() +
                " | " +
                "Датум: " +
                sample.getAnalysisDateAndTime() +
                " | " +
                "Пациент: " +
                sample.getPatientId();
        return createSampleInfoTable(sampleInfoText);
    }

    private PdfPTable createSampleInfoTable(String sampleInfoText) throws DocumentException {

        PdfPCell sampleInfo = Util.createDefaultCellWithItalics(sampleInfoText, SMALL_FONT_SIZE, FontUtil.MACEDONIAN,
                Element.ALIGN_CENTER, FontUtil.DEFAULT_FONT_COLOR, Util.CYAN_COLOR);
        Util.disableBorders(sampleInfo);
        sampleInfo.setPadding(3);

        PdfPTable sampleInfoWrapperTable = new PdfPTable(2);
        float[] columnSampleWidths = {
                8,
                92
        };
        sampleInfoWrapperTable.setWidths(columnSampleWidths);
        sampleInfoWrapperTable.addCell(Util.createBorderlessCell());
        sampleInfoWrapperTable.addCell(sampleInfo);
        return sampleInfoWrapperTable;
    }

    private PdfPCell createOkayResultCell(String name) {
        PdfPCell parameterCell = Util.createDefaultCell(
                name,
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN,
                PdfPCell.ALIGN_CENTER,
                FontUtil.OKAY_RESULT_FONT_COLOR);
        return parameterCell;
    }

    private PdfPCell createBadResultCell(String name) {
        PdfPCell parameterCell = Util.createDefaultCell(
                name,
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN,
                PdfPCell.ALIGN_CENTER,
                FontUtil.BAD_RESULT_FONT_COLOR);
        return parameterCell;
    }

    private PdfPCell createParameterCell(String name) {
        PdfPCell parameterCell = Util.createDefaultCell(
                name,
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN,
                PdfPCell.ALIGN_CENTER);
//        tableWrapper.addCell(parameterCell);
        return parameterCell;
    }

    private PdfPCell createResultsTableTitleCell(
            String title,
            int rowIndex,
            int startTitleIndex,
            int numberOfParameters) {

        PdfPCell cell;

        boolean isFirstOrLastParameter = rowIndex == 0 || rowIndex == numberOfParameters - 1;
//        if (isFirstOrLastParameter) {
//            LineSeparator fullLine = new LineSeparator();
//            fullLine.setLineColor(Util.CYAN_COLOR);
//            fullLine.setLineWidth(0.5f);
//            fullLine.setPercentage(50);
//            cell = Util.createBorderlessCell();
//            cell.addElement(fullLine);
//            return cell;
//        }

        if (rowIndex >= startTitleIndex && rowIndex <= ( startTitleIndex + title.length() - 1)) {
            int index = rowIndex - startTitleIndex;
            char character = title.charAt(index);
            cell = Util.createBorderlessCell(
                    String.valueOf(character),
                    CELL_FONT_SIZE,
                    FontUtil.MACEDONIAN,
                    BaseColor.WHITE,
                    Util.CYAN_COLOR);
        } else {
//            PdfPTable innerWrapper = Util.createBorderlessTable(2);
//            innerWrapper.setWidthPercentage(100);
//            PdfPCell leftCell = Util.createCellWithRightBorderOnly(Util.CYAN_COLOR);
//            PdfPCell rightCell = Util.createCellWithLeftBorderOnly(Util.CYAN_COLOR);
//            innerWrapper.addCell(leftCell);
//            innerWrapper.addCell(rightCell);

            cell = Util.createBorderlessCell();
//            cell.addElement(innerWrapper);
        }

        return cell;
    }

    private PdfPTable createHeaderRowForResultsTable(float[] columnWidths) throws DocumentException {

        PdfPTable tableWrapper = Util.createBorderlessTable(5);
        tableWrapper.setWidths(columnWidths);

        PdfPHeaderCell empty = Util.createBorderlessHeaderCell();
        tableWrapper.addCell(empty);

        PdfPHeaderCell parameter = Util.createDefaultHeaderCell(
                "ПАРАМЕТАР",
                HEADER_FONT_SIZE,
                FontUtil.MACEDONIAN);
        tableWrapper.addCell(parameter);

        PdfPHeaderCell result = Util.createDefaultHeaderCell(
                "РЕЗУЛТАТ",
                HEADER_FONT_SIZE,
                FontUtil.MACEDONIAN);
        tableWrapper.addCell(result);

        PdfPHeaderCell units = Util.createDefaultHeaderCell(
                "ЕДИНИЦА",
                HEADER_FONT_SIZE,
                FontUtil.MACEDONIAN);
        tableWrapper.addCell(units);

        PdfPHeaderCell refValues = Util.createDefaultHeaderCell(
                "РЕФЕРЕНТНИ ВРЕДНОСТИ",
                HEADER_FONT_SIZE,
                FontUtil.MACEDONIAN);
        tableWrapper.addCell(refValues);

        return tableWrapper;
    }

//    private PdfPCell generateInfoTables(ExigoSample exigoSample, Patient patient) {
//
//        PdfPCell wrapper = Util.createBorderlessCell();
//        wrapper.setVerticalAlignment(Element.ALIGN_TOP);
//
//        PdfPTable tableWrapper = Util.createBorderlessTable(1);
//        tableWrapper.setWidthPercentage(90);
//
//        PdfPCell sampleInfoCell = generateSampleInfoTable(exigoSample);
//        PdfPCell empty = Util.createBorderlessCell();
//        empty.addElement(Chunk.NEWLINE);
//        PdfPCell clientInfoCell = generatePatientInfoTable(patient);
//
//        tableWrapper.addCell(sampleInfoCell);
//        tableWrapper.addCell(empty);
//        tableWrapper.addCell(clientInfoCell);
//        wrapper.addElement(tableWrapper);
//
//        return wrapper;
//    }

    private PdfPCell generatePatientInfoTable(Patient patient, boolean isOnlyOneTableBeingGeneratedInTheReport) {

        PdfPTable table = Util.createBorderlessTable(2);
        table.setHorizontalAlignment(Element.ALIGN_MIDDLE);

        PdfPCell title = Util.createDefaultCell(
                "ПАЦИЕНТ",
                HEADER_FONT_SIZE,
                FontUtil.MACEDONIAN,
                Rectangle.ALIGN_RIGHT,
                (isOnlyOneTableBeingGeneratedInTheReport) ? BaseColor.WHITE : FontUtil.DEFAULT_FONT_COLOR,
                BaseColor.WHITE);
        if (isOnlyOneTableBeingGeneratedInTheReport) {
            title.setBackgroundColor(Util.CYAN_COLOR);
        } else {
            title.setBackgroundColor(Util.LIGHT_GRAY_COLOR);
        }
        PdfPCell emptyCell = Util.createBorderlessCell();
        title.setBorderWidth(0);
        if (isOnlyOneTableBeingGeneratedInTheReport) {
            emptyCell.setBackgroundColor(Util.CYAN_COLOR);
//            emptyCell.setBorderColor(Util.CYAN_COLOR);
        } else {
            emptyCell.setBackgroundColor(Util.LIGHT_GRAY_COLOR);
//            emptyCell.setBorderColor(Util.LIGHT_GRAY_COLOR);
        }
        title.setPaddingTop(7);
        title.setPaddingBottom(5);
        table.addCell(emptyCell);
        table.addCell(title);

        PdfPCell name = Util.createDefaultCellWithLeftRightAlignment(
                "Име: ",
                patient.getName(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        name.setColspan(2);
        table.addCell(name);

        PdfPCell owner = Util.createDefaultCellWithLeftRightAlignment(
                "Сопственик: ",
                patient.getOwner(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        owner.setColspan(2);
        table.addCell(owner);

        PatientType patientType = patient.getPatientType();
        PdfPCell type = Util.createDefaultCellWithLeftRightAlignment(
                "Вид: ",
                patientType.getProfileTranslated(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        type.setColspan(2);
        table.addCell(type);

        PdfPCell patientId = Util.createDefaultCellWithLeftRightAlignment(
                "Микрочип: ",
                patient.getPatientIdMicrochip(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        patientId.setColspan(2);
        table.addCell(patientId);

        PdfPCell gender = Util.createDefaultCellWithLeftRightAlignment(
                "Пол: ",
                patient.getGender().getGenderTranslated(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        gender.setColspan(2);
        table.addCell(gender);

        if (patient.getDateOfBirth() != null) {
            PdfPCell dateOfBirth = Util.createDefaultCellWithLeftRightAlignment(
                    "Датум на раѓање: ",
                    Util.formatDate(patient.getDateOfBirth()),
                    CELL_FONT_SIZE,
                    FontUtil.MACEDONIAN);
            dateOfBirth.setColspan(2);
            table.addCell(dateOfBirth);
        }

        PdfPCell wrapper = Util.createBorderlessCell();
        wrapper.addElement(table);
        return wrapper;
    }

    private PdfPCell generateSampleInfoTable(ExigoSample exigoSample) {

        PdfPTable table = Util.createBorderlessTable(2);
        table.setHorizontalAlignment(Element.ALIGN_MIDDLE);

        PdfPCell title = Util.createDefaultCell(
                "информации",
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        table.addCell(title);
        table.addCell(Util.createBorderlessCell());

        PdfPCell sampleID = Util.createDefaultCellWithLeftRightAlignment(
                "Број на примерок: ",
                exigoSample.getSampleId(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        sampleID.setColspan(2);
        table.addCell(sampleID);

        PdfPCell dateOfReception = Util.createDefaultCellWithLeftRightAlignment(
                "Датум на прием: ",
                exigoSample.getAnalysisDateAndTime(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        dateOfReception.setColspan(2);
        table.addCell(dateOfReception);

        PdfPCell dateOfIssue = Util.createDefaultCellWithLeftRightAlignment(
                "Датум на издавање: ",
                Util.getCurrentFormattedDate(),
                CELL_FONT_SIZE,
                FontUtil.MACEDONIAN);
        dateOfIssue.setColspan(2);
        table.addCell(dateOfIssue);

        PdfPCell wrapper = Util.createBorderlessCell();
        wrapper.addElement(table);
        return wrapper;
    }

    /**
     *
     * Tip: use column text if you want to do overlay
     * @param document
     * @param writer
     * @return height of header
     */
    private float generateHeader(Document document, PdfWriter writer) {

        try {
            Paragraph leftHeader = new Paragraph();

            // left header - logo
            Image logo = Image.getInstance(Util.getAbsolutePath(Constants.LOGO));
            logo.scaleToFit(80, 80);
            leftHeader.add(new Chunk(logo, 0, 0, true));
            leftHeader.setIndentationLeft(20);

            // middle header - name
            Paragraph middleHeader = new Paragraph();
            middleHeader.setAlignment(Element.ALIGN_LEFT);

            Chunk vetClinic = new Chunk(Content.VET_CLINIC, FontUtil.getMacedonianFont(15));
            vetClinic.setWordSpacing(2);
            vetClinic.setLineHeight(15);

            Chunk nameOfClinic = new Chunk(Content.CLINIC_NAME, FontUtil.getMacedonianFont(25));
            nameOfClinic.setWordSpacing(2);
            nameOfClinic.setLineHeight(20);

            middleHeader.add(vetClinic);
            middleHeader.add(Chunk.NEWLINE);
            middleHeader.add(nameOfClinic);

            // right header - small info

            Font macedonianFont = FontUtil.getMacedonianFont(11);
            macedonianFont.setStyle(Font.BOLD);
            macedonianFont.setColor(Util.CYAN_DARK_COLOR);
            Chunk contact = new Chunk(Content.CONTACT, macedonianFont);
            contact.setWordSpacing(2);

            Chunk address1 = new Chunk(Content.ADDRESS1, FontUtil.getMacedonianFont(SMALL_INFO_FONT_SIZE));
            address1.setWordSpacing(2);

            Chunk address2 = new Chunk(Content.ADDRESS2, FontUtil.getMacedonianFont(SMALL_INFO_FONT_SIZE));
            address2.setWordSpacing(2);

            Chunk mobile = new Chunk(Content.MOBILE, FontUtil.getMacedonianFont(SMALL_INFO_FONT_SIZE));
            mobile.setWordSpacing(2);

            Chunk email = new Chunk(Content.EMAIL, FontUtil.getMacedonianFont(SMALL_INFO_FONT_SIZE));
            email.setWordSpacing(2);

            int spaceBetweenLines = 11;
            Paragraph rightHeader = new Paragraph(spaceBetweenLines);
            rightHeader.add(contact);
            rightHeader.add(Chunk.NEWLINE);
            rightHeader.add(address1);
            rightHeader.add(Chunk.NEWLINE);
            rightHeader.add(address2);
            rightHeader.add(Chunk.NEWLINE);
            rightHeader.add(mobile);
            rightHeader.add(Chunk.NEWLINE);
            rightHeader.add(email);
            rightHeader.setIndentationLeft(50);

////            DottedLineSeparator lineSeparator = new DottedLineSeparator();
////            lineSeparator.setLineColor(Util.CYAN_COLOR);
////            lineSeparator.setLineWidth(0.7f);
////            lineSeparator.setPercentage(85f);
////            lineSeparator.setGap(2f);
////            lineSeparator.setAlignment(Element.ALIGN_LEFT);


            // add in Table wrapper
            PdfPTable wrapper = Util.createBorderlessTable(3);
//            wrapper.setWidthPercentage(100); // make table fit across whole page
            float[] widthsOfColumns = {
                    20, 45, 35
            }; // 30% logo, and 70% info sections
            wrapper.setWidths(widthsOfColumns);

            PdfPCell leftHeaderCell = Util.createBorderlessCell();
            leftHeaderCell.setPaddingTop(10);
            leftHeaderCell.addElement(leftHeader);
            wrapper.addCell(leftHeaderCell);

            PdfPCell middleHeaderCell = Util.createBorderlessCell();
            middleHeaderCell.addElement(middleHeader);
            wrapper.addCell(middleHeaderCell);

            PdfPCell rightHeaderCell = Util.createBorderlessCell();
            rightHeaderCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
            rightHeaderCell.addElement(rightHeader);
            wrapper.addCell(rightHeaderCell);

            document.add(wrapper);
            return wrapper.getTotalHeight();
        } catch (DocumentException | IOException e) {
            e.printStackTrace();
        }

        return -1;
    }

    private void generateInfo(Document document, PdfWriter writer) throws DocumentException {
        ColumnText columnText;

        // info
        Paragraph infoWrapper = new Paragraph();
        infoWrapper.setAlignment(Element.ALIGN_RIGHT);
        Font macedonian = FontUtil.getMacedonianFont(20);

        Phrase vetClinic = new Phrase(Content.VET_CLINIC, macedonian);
        infoWrapper.add(vetClinic);

        infoWrapper.add(Chunk.NEWLINE);
        infoWrapper.add(Chunk.NEWLINE);

        Phrase clinicName = new Phrase(Content.CLINIC_NAME, macedonian);
        infoWrapper.add(clinicName);


        Rectangle rectangleInfo = new Rectangle(new Rectangle(document.left() + Constants.LOGO_WIDHT + 50,
                document.top() -  Constants.LOGO_HEIGHT,
                document.right() - 20, document.top() - 20)
        );

        PdfContentByte canvas = writer.getDirectContent();
        Util.maskHelperRectangleAndAddToCanvas(rectangleInfo, canvas);


        columnText = new ColumnText(canvas);


        columnText.setSimpleColumn(rectangleInfo);
        columnText.setUseAscender(true);
        columnText.addElement(infoWrapper);
        columnText.go();
    }

    private void generateLogo(Document document, PdfWriter writer) throws IOException, DocumentException {

        Paragraph logoWrapper = new Paragraph();
        logoWrapper.setAlignment(Element.ALIGN_MIDDLE);

        Image logo = Image.getInstance(Util.getAbsolutePath(Constants.LOGO));
        logoWrapper.add(logo);
        PdfContentByte canvas = writer.getDirectContent();

        ColumnText columnText = new ColumnText(canvas);
        // 192 x 195 - logo size - TODO: this is bad. but it works. fix it :P

        Rectangle rectangle = new Rectangle(document.left() + Constants.LEFT_DOC_MARGIN ,
                document.top() - Constants.LOGO_HEIGHT - Constants.TOP_DOC_MARGIN,
                document.left() + Constants.LOGO_WIDHT + Constants.LEFT_DOC_MARGIN,
                document.top() - Constants.TOP_DOC_MARGIN);

        Util.maskHelperRectangleAndAddToCanvas(rectangle, canvas);
        columnText.setSimpleColumn(rectangle);
        Chunk logoChunk = new Chunk(logo, 0, 0, true);
        // TODO: align in middle
        columnText.addText(logoChunk);
//        columnText.addElement(logoWrapper);
        columnText.go();
    }

    private File createPDFImpl(Patient patient, List<Sample> samples, String outputPath)
            throws CreatingDirectoryException, IOException, DocumentException, GeneratingPDFReportException {

        // Create parent directory if it doesn't exist
        File pdfFile = new File(outputPath);
        File parentDir = pdfFile.getParentFile();
        if (parentDir != null && !parentDir.exists()) {
            boolean created = parentDir.mkdirs();
            if (!created && !parentDir.exists()) {
                throw new CreatingDirectoryException(parentDir.getAbsolutePath(), "Failed to create parent directory");
            }
        }

        // Create PDF document
        OutputStream file = new FileOutputStream(pdfFile);
        Rectangle A4 = PageSize.A4;
        Document document = new Document(A4, 0, 0, 0, 0);
        PdfWriter writer = PdfWriter.getInstance(document, file);
        document.open();

        // Generate the report content
        generateReport(document, writer, patient, samples);

        // Close document and stream
        document.close();
        file.close();

        return pdfFile;
    }

    public static PDFReportService getInstance() {
        return instance;
    }
}
