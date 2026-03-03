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
import com.vetclinic.pdf.models.samples.PcrSample;
import com.vetclinic.pdf.models.samples.PointcareSample;
import com.vetclinic.pdf.models.samples.Sample;
import com.vetclinic.pdf.models.parameters.PcrParameter;
import com.vetclinic.pdf.util.AmplificationCurveRenderer;
import com.itextpdf.text.*;
import com.itextpdf.text.Font;
import com.itextpdf.text.Image;
import com.itextpdf.text.Rectangle;
import com.itextpdf.text.pdf.*;
import com.itextpdf.text.pdf.draw.LineSeparator;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;
import javax.imageio.ImageIO;


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

        // Separate PCR samples from regular samples
        List<Sample> regularSamples = new ArrayList<>();
        List<PcrSample> pcrSamples = new ArrayList<>();

        for (Sample sample : samples) {
            if (sample instanceof PcrSample) {
                pcrSamples.add((PcrSample) sample);
            } else {
                regularSamples.add(sample);
            }
        }

        // Generate regular report if there are non-PCR samples
        if (!regularSamples.isEmpty()) {
            generateRegularReport(document, writer, patient, regularSamples);
        }

        // Generate PCR report on separate page(s) if there are PCR samples
        for (PcrSample pcrSample : pcrSamples) {
            if (!regularSamples.isEmpty() || pcrSamples.indexOf(pcrSample) > 0) {
                document.newPage();
            }
            generatePcrReport(document, writer, patient, pcrSample);
        }
    }

    private void generateRegularReport(Document document,
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
                patient.getOwner() != null ? patient.getOwner() : "",
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

    // ==================== PCR REPORT METHODS ====================

    /**
     * Generate a PCR report page for a single PCR sample.
     * PCR reports are always on separate pages from other samples.
     */
    private void generatePcrReport(Document document, PdfWriter writer, Patient patient, PcrSample pcrSample)
            throws DocumentException, IOException {

        float headerHeight = generateHeader(document, writer);
        float titleHeight = generatePcrTitleLine(document);
        float patientInfoHeight = generatePcrPatientInfo(document, patient, pcrSample);
        float resultsTableHeight = generatePcrResultsTable(document, pcrSample);
        float curvesHeight = generateAmplificationCurves(document, pcrSample);
        float explanationHeight = generatePcrExplanation(document);

        float contentHeight = headerHeight + titleHeight + patientInfoHeight +
                              resultsTableHeight + curvesHeight + explanationHeight;

        generatePcrFooter(document, writer, contentHeight, pcrSample);
    }

    /**
     * Generate the PCR title line: "Test Report"
     */
    private float generatePcrTitleLine(Document document) throws DocumentException {
        // Title centered below the header
        Font titleFont = FontUtil.getMacedonianFont(14, Util.CYAN_DARK_COLOR);
        Paragraph title = new Paragraph("Извештај од тест", titleFont);
        title.setAlignment(Element.ALIGN_CENTER);
        title.setSpacingBefore(5);
        title.setSpacingAfter(5);
        document.add(title);
        return 25; // Approximate height
    }

    /**
     * Generate compact patient info table for PCR report.
     * Layout matches the reference form:
     * Row 1: Species:Dog | ID:56 | Patient name:kaja
     * Row 2: Owner: | Gender: | Age:0 Years
     * Row 3: Analyzer Information: 0C1231-4-0015 | Diagnosis note:
     */
    private float generatePcrPatientInfo(Document document, Patient patient, PcrSample pcrSample)
            throws DocumentException {

        PdfPTable table = Util.createBorderlessTable(3);
        float[] columnWidths = { 33, 34, 33 };
        table.setWidths(columnWidths);
        table.setWidthPercentage(95);
        table.setSpacingBefore(5);
        table.setSpacingAfter(5);

        // Row 1: Species, ID, Patient name (Macedonian)
        String speciesVal = patient.getPatientType() != null ? patient.getPatientType().getCode() : "";
        table.addCell(createPcrInfoCell("Вид:" + speciesVal));
        table.addCell(createPcrInfoCell("ИД:" + (pcrSample.getPatientId() != null ? pcrSample.getPatientId() : "")));
        table.addCell(createPcrInfoCell("Име на пациент:" + (patient.getName() != null ? patient.getName() : "")));

        // Row 2: Owner, Gender, Age (Macedonian)
        table.addCell(createPcrInfoCell("Сопственик:" + (patient.getOwner() != null ? patient.getOwner() : "")));
        String genderVal = patient.getGender() != null ? patient.getGender().getGenderTranslated() : "";
        table.addCell(createPcrInfoCell("Пол:" + genderVal));
        String ageStr = "0 Години";
        if (patient.getDateOfBirth() != null) {
            java.time.Period age = java.time.Period.between(patient.getDateOfBirth(), java.time.LocalDate.now());
            ageStr = age.getYears() + " Години";
        }
        table.addCell(createPcrInfoCell("Возраст:" + ageStr));

        // Row 3: Analyzer Information, Diagnosis note (Macedonian)
        String analyzerInfo = pcrSample.getAnalyzerInfo() != null ? pcrSample.getAnalyzerInfo() : pcrSample.getSampleId();
        table.addCell(createPcrInfoCell("Информации за анализатор: " + analyzerInfo));
        PdfPCell diagnosisCell = createPcrInfoCell("Дијагностичка белешка:");
        diagnosisCell.setColspan(2);
        table.addCell(diagnosisCell);

        document.add(table);
        return table.getTotalHeight();
    }

    private PdfPCell createPcrInfoCell(String text) {
        PdfPCell cell = Util.createDefaultCell(text, SMALL_FONT_SIZE, FontUtil.MACEDONIAN,
                PdfPCell.ALIGN_LEFT, FontUtil.DEFAULT_FONT_COLOR);
        cell.setBorderColor(BaseColor.LIGHT_GRAY);
        cell.setBorderWidth(0.5f);
        cell.enableBorderSide(Rectangle.BOTTOM);
        cell.setPaddingTop(4);
        cell.setPaddingBottom(4);
        return cell;
    }

    /**
     * Generate the PCR results table with columns:
     * Item Name | Sample Type | Result(Ct) | Ranges | Indicator | Lot
     */
    private float generatePcrResultsTable(Document document, PcrSample pcrSample) throws DocumentException {
        // Report title
        Paragraph reportTitle = new Paragraph("Извештај",
                FontUtil.getMacedonianFont(11, FontUtil.DEFAULT_FONT_COLOR));
        reportTitle.setAlignment(Element.ALIGN_CENTER);
        reportTitle.setSpacingBefore(5);
        reportTitle.setSpacingAfter(5);
        document.add(reportTitle);

        // Results table
        PdfPTable table = new PdfPTable(6);
        table.setWidthPercentage(95);
        float[] columnWidths = { 12, 35, 12, 14, 14, 13 };
        table.setWidths(columnWidths);

        // Header row with cyan/teal background matching the reference
        BaseColor headerBg = new BaseColor(180, 220, 220); // Light cyan/teal header
        table.addCell(createPcrHeaderCell("Име на тест", headerBg));
        table.addCell(createPcrHeaderCell("Тип на примерок", headerBg));
        table.addCell(createPcrHeaderCell("Резултат(Ct)", headerBg));
        table.addCell(createPcrHeaderCell("Опсег", headerBg));
        table.addCell(createPcrHeaderCell("Индикатор", headerBg));
        table.addCell(createPcrHeaderCell("Лот", headerBg));

        // Data rows
        for (PcrParameter param : pcrSample.getPcrParameters()) {
            // Item name
            table.addCell(createPcrDataCell(param.getName(), false));

            // Sample type - empty to match reference
            table.addCell(createPcrDataCell("", false));

            // Result (Ct) - highlight positive results in red
            String result = param.getResult() != null ? param.getResult() : "NoCt";
            table.addCell(createPcrDataCell(result, param.isPositive()));

            // Ranges
            String ranges = param.getReferentValues() != null ? param.getReferentValues() : ">36 or NoCt";
            table.addCell(createPcrDataCell(ranges, false));

            // Indicator
            String indicator = param.isPositive() ? "Positive(+)" : "Negative(-)";
            table.addCell(createPcrDataCell(indicator, param.isPositive()));

            // Lot
            String lot = param.getLotNumber() != null ? param.getLotNumber() : "";
            table.addCell(createPcrDataCell(lot, false));
        }

        document.add(table);
        return table.getTotalHeight() + 30; // Include report title
    }

    private PdfPCell createPcrHeaderCell(String text, BaseColor bgColor) {
        Font font = FontUtil.getMacedonianFont(SMALL_FONT_SIZE, BaseColor.DARK_GRAY);
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(bgColor);
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        cell.setPadding(4);
        cell.setBorderColor(BaseColor.LIGHT_GRAY);
        return cell;
    }

    private PdfPCell createPcrDataCell(String text, boolean isPositive) {
        BaseColor fontColor = isPositive ? FontUtil.BAD_RESULT_FONT_COLOR : FontUtil.DEFAULT_FONT_COLOR;
        Font font = FontUtil.getMacedonianFont(SMALL_FONT_SIZE, fontColor);
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        cell.setPadding(3);
        cell.setBorderColor(BaseColor.LIGHT_GRAY);
        return cell;
    }

    /**
     * Generate amplification curve graphs arranged in a 3x2 grid.
     */
    private float generateAmplificationCurves(Document document, PcrSample pcrSample)
            throws DocumentException, IOException {

        List<PcrParameter> params = pcrSample.getPcrParameters();
        if (params == null || params.isEmpty()) {
            return 0;
        }

        // Create a table to hold the curves (3 columns)
        PdfPTable curvesTable = new PdfPTable(3);
        curvesTable.setWidthPercentage(95);
        curvesTable.setSpacingBefore(15);
        curvesTable.setSpacingAfter(10);

        int figureNumber = 1;
        for (int i = 0; i < params.size(); i++) {
            PcrParameter param = params.get(i);

            // Render the curve image
            BufferedImage curveImage = AmplificationCurveRenderer.renderCurve(param, figureNumber);

            // Convert BufferedImage to iText Image
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(curveImage, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();
            Image pdfImage = Image.getInstance(imageBytes);
            pdfImage.scaleToFit(
                    AmplificationCurveRenderer.getChartWidth(),
                    AmplificationCurveRenderer.getChartHeight()
            );

            // Create cell with image
            PdfPCell cell = new PdfPCell(pdfImage);
            cell.setBorder(Rectangle.NO_BORDER);
            cell.setHorizontalAlignment(Element.ALIGN_CENTER);
            cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
            cell.setPadding(5);
            curvesTable.addCell(cell);

            figureNumber++;
        }

        // Fill remaining cells if not a multiple of 3
        int remainder = params.size() % 3;
        if (remainder != 0) {
            for (int i = 0; i < (3 - remainder); i++) {
                PdfPCell emptyCell = Util.createBorderlessCell();
                curvesTable.addCell(emptyCell);
            }
        }

        document.add(curvesTable);
        return curvesTable.getTotalHeight();
    }

    /**
     * Generate the PCR explanation/legend section with Ct interpretation.
     */
    private float generatePcrExplanation(Document document) throws DocumentException {
        Font boldFont = FontUtil.getMacedonianFont(SMALL_FONT_SIZE, FontUtil.DEFAULT_FONT_COLOR);
        boldFont.setStyle(Font.BOLD);
        Font normalFont = FontUtil.getMacedonianFont(SMALL_FONT_SIZE - 1, FontUtil.DEFAULT_FONT_COLOR);

        // Report Explanation header
        Paragraph explanationHeader = new Paragraph();
        explanationHeader.add(new Chunk("Објаснување на извештајот:", boldFont));
        explanationHeader.setSpacingBefore(10);
        explanationHeader.setIndentationLeft(20);
        document.add(explanationHeader);

        // Ct interpretation lines
        String[] explanationLines = {
            "Ct≤17: екстремно висока концентрација на патогени; 17<Ct≤27: висока концентрација на патогени;",
            "27<Ct≤36: ниска концентрација на патогени; Ct>36: екстремно ниска концентрација на патогени или без патогени; NoCt: без патогени;",
            "Забелешка: кога се пријавува Ct>36, постои можност патогенот да не е во период на детоксикација. Треба да се земе предвид во комбинација со клинички симптоми и други резултати од тестови."
        };

        for (String line : explanationLines) {
            Paragraph p = new Paragraph(line, normalFont);
            p.setLeading(10);
            p.setIndentationLeft(20);  // Add left margin
            p.setIndentationRight(20); // Add right margin
            document.add(p);
        }

        // Note section
        Paragraph noteHeader = new Paragraph();
        noteHeader.add(new Chunk("Забелешка:", boldFont));
        noteHeader.setSpacingBefore(5);
        noteHeader.setIndentationLeft(20);
        document.add(noteHeader);

        String[] noteLines = {
            "1.Резултатите од овој тест се само за клиничка референца. Сеопфатен преглед на клиничката дијагноза и третман на пациентите мора да се направи во комбинација со спектарот на патогени и епидемиолошкиот статус.",
            "2.Кога вредноста на Ct е ≤36, резултатот од детекцијата е позитивен.",
            "   Кога вредноста на Ct е > 36 или NoCt, резултатот е негативен",
            "   *Ако вредноста на Ct е >36, се препорачува повторно тестирање. Ако вредноста на Ct е > 36 или NoCt, резултатот е негативен. Ако вредноста на Ct е ≤36, резултатот е позитивен."
        };

        for (String line : noteLines) {
            Paragraph p = new Paragraph(line, normalFont);
            p.setLeading(10);
            p.setIndentationLeft(20);  // Add left margin
            p.setIndentationRight(20); // Add right margin
            document.add(p);
        }

        return 120; // Approximate height of explanation section
    }

    /**
     * Format PCR datetime from ISO format to DD/MM/YYYY HH:MM format.
     */
    private String formatPcrDateTime(String isoDateTime) {
        if (isoDateTime == null || isoDateTime.isEmpty()) return "";
        try {
            // Parse ISO format and convert to DD/MM/YYYY HH:MM
            java.time.OffsetDateTime odt = java.time.OffsetDateTime.parse(isoDateTime);
            return odt.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
        } catch (Exception e) {
            try {
                // Try LocalDateTime format (without offset)
                java.time.LocalDateTime ldt = java.time.LocalDateTime.parse(isoDateTime);
                return ldt.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
            } catch (Exception e2) {
                // Fallback: return as-is
                return isoDateTime;
            }
        }
    }

    /**
     * Generate the PCR footer with timestamps and personnel fields.
     */
    private void generatePcrFooter(Document document, PdfWriter writer, float contentHeight, PcrSample pcrSample)
            throws DocumentException, IOException {

        float pageHeight = writer.getPageSize().getHeight();

        // Timestamps table
        PdfPTable timestampsTable = Util.createBorderlessTable(3);
        float[] tsColumnWidths = { 33, 34, 33 };
        timestampsTable.setWidths(tsColumnWidths);

        String submitDt = formatPcrDateTime(pcrSample.getSubmitDateTime());
        String analysisDt = formatPcrDateTime(pcrSample.getAnalysisDateAndTime());
        String printDt = pcrSample.getPrintDateTime() != null ? formatPcrDateTime(pcrSample.getPrintDateTime()) : Util.getCurrentFormattedDate();

        timestampsTable.addCell(createPcrFooterCell("Датум на поднесување:" + submitDt));
        timestampsTable.addCell(createPcrFooterCell("Датум на анализа:" + analysisDt));
        timestampsTable.addCell(createPcrFooterCell("Датум на печатење:" + printDt));

        // Personnel table
        PdfPTable personnelTable = Util.createBorderlessTable(3);
        personnelTable.setWidths(tsColumnWidths);

        String submitter = ""; // Usually empty in the reference
        String operator = pcrSample.getOperator() != null ? pcrSample.getOperator() : "";
        String reviewer = pcrSample.getReviewer() != null ? pcrSample.getReviewer() : "";

        personnelTable.addCell(createPcrFooterCell("Поднесувач:" + submitter));
        personnelTable.addCell(createPcrFooterCell("Оператор:" + operator));
        personnelTable.addCell(createPcrFooterCell("Прегледувач:" + reviewer));

        // Note line
        Paragraph noteLine = new Paragraph();
        Font italicFont = FontUtil.getMacedonianFont(SMALL_FONT_SIZE - 1, FontUtil.DEFAULT_FONT_COLOR);
        italicFont.setStyle(Font.ITALIC);
        Chunk noteChunk = new Chunk("Забелешка:                                                                                Резултатите се однесуваат само на тестираниот примерок", italicFont);
        noteLine.add(noteChunk);
        noteLine.setIndentationLeft(20); // Add left indentation to match tables

        // Calculate spacing
        float footerHeight = 80;
        float spaceWithoutFooter = pageHeight - contentHeight;
        float spaceBeforeFooter = 0;
        if (spaceWithoutFooter > footerHeight) {
            spaceBeforeFooter = spaceWithoutFooter - footerHeight - 20;
        }

        // Add indentation to footer tables
        timestampsTable.setWidthPercentage(90);  // Narrower = indented from right
        timestampsTable.setHorizontalAlignment(Element.ALIGN_LEFT);
        personnelTable.setWidthPercentage(90);
        personnelTable.setHorizontalAlignment(Element.ALIGN_LEFT);

        timestampsTable.setSpacingBefore(spaceBeforeFooter);
        document.add(timestampsTable);
        document.add(personnelTable);
        document.add(noteLine);
    }

    private PdfPCell createPcrFooterCell(String text) {
        PdfPCell cell = Util.createDefaultCell(text, SMALL_FONT_SIZE - 1, FontUtil.MACEDONIAN,
                PdfPCell.ALIGN_LEFT, FontUtil.DEFAULT_FONT_COLOR);
        Util.disableBorders(cell);
        cell.setPaddingTop(2);
        cell.setPaddingBottom(2);
        cell.setPaddingLeft(20); // Add left padding for indentation
        return cell;
    }

    // ==================== END PCR REPORT METHODS ====================

    public static PDFReportService getInstance() {
        return instance;
    }
}
