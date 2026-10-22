package com.vetclinic.pdf.util;

import com.vetclinic.pdf.models.parameters.PcrParameter;
import org.jfree.chart.ChartFactory;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.NumberAxis;
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.plot.XYPlot;
import org.jfree.chart.renderer.xy.XYLineAndShapeRenderer;
import org.jfree.data.xy.XYSeries;
import org.jfree.data.xy.XYSeriesCollection;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.text.DecimalFormat;
import java.text.NumberFormat;
import java.util.List;

/**
 * Renders PCR amplification curves using JFreeChart.
 * Creates small graph images suitable for embedding in PDF reports.
 */
public class AmplificationCurveRenderer {

    // Chart dimensions matching the reference form
    // We render at 4x resolution for better quality, then report smaller dimensions for PDF scaling
    private static final int SCALE_FACTOR = 4;
    private static final int CHART_WIDTH = 180;
    private static final int LABEL_AREA_HEIGHT = 18; // Space for label below chart
    private static final int PLOT_HEIGHT = 127; // Height of the actual chart plot
    private static final int CHART_HEIGHT = PLOT_HEIGHT + LABEL_AREA_HEIGHT; // Total image height (145)

    // Internal render dimensions (scaled up for quality)
    private static final int RENDER_WIDTH = CHART_WIDTH * SCALE_FACTOR;
    private static final int RENDER_PLOT_HEIGHT = PLOT_HEIGHT * SCALE_FACTOR;
    private static final int RENDER_LABEL_HEIGHT = LABEL_AREA_HEIGHT * SCALE_FACTOR;
    private static final int RENDER_HEIGHT = RENDER_PLOT_HEIGHT + RENDER_LABEL_HEIGHT;

    // X-axis range (PCR cycles)
    private static final int X_MIN = 8;
    private static final int X_MAX = 40;

    // Colors
    private static final Color CURVE_COLOR = new Color(0, 100, 180); // Blue line for the curve data
    private static final Color RESULT_LINE_COLOR = new Color(0, 150, 0); // Green line for final result
    private static final Color THRESHOLD_COLOR = new Color(180, 0, 0); // Red threshold line
    private static final Color BACKGROUND_COLOR = Color.WHITE;
    private static final Color GRID_COLOR = new Color(200, 200, 200);
    private static final Color AXIS_BACKGROUND = new Color(220, 225, 230); // Light bluish-gray for axis area

    /**
     * Render an amplification curve for a PCR parameter.
     *
     * @param parameter The PCR parameter with curve data
     * @param figureNumber The figure number for the title (e.g., "Figure 1:CDV")
     * @return BufferedImage of the rendered chart
     */
    public static BufferedImage renderCurve(PcrParameter parameter, int figureNumber) {
        List<Double> curveData = parameter.getCurveData();
        String testCode = parameter.getTestCode() != null ? parameter.getTestCode().getCode() : parameter.getName();

        // Fewer than two points is not a curve; draw an empty plot rather than invent one.
        boolean hasCurve = curveData != null && curveData.size() >= 2;
        Double finalValue = hasCurve ? curveData.get(curveData.size() - 1) : null;
        Double thresholdValue = thresholdLine(parameter);

        // Series that have no data stay empty, so they draw nothing.
        XYSeries curveSeries = new XYSeries("Curve");
        XYSeries resultSeries = new XYSeries("Result");
        XYSeries thresholdSeries = new XYSeries("Threshold");

        if (hasCurve) {
            int numPoints = curveData.size();
            double cycleStep = (double) (X_MAX - X_MIN) / (numPoints - 1);
            for (int i = 0; i < numPoints; i++) {
                curveSeries.add(X_MIN + (i * cycleStep), curveData.get(i));
            }
            resultSeries.add(X_MIN, finalValue);
            resultSeries.add(X_MAX, finalValue);
        }
        if (thresholdValue != null) {
            thresholdSeries.add(X_MIN, thresholdValue);
            thresholdSeries.add(X_MAX, thresholdValue);
        }

        XYSeriesCollection dataset = new XYSeriesCollection();
        dataset.addSeries(curveSeries);      // Index 0: Blue curve
        dataset.addSeries(resultSeries);     // Index 1: Green result line
        dataset.addSeries(thresholdSeries);  // Index 2: Red threshold line

        // Create chart
        JFreeChart chart = ChartFactory.createXYLineChart(
                null, // No title - we'll add it separately
                null, // X axis label
                null, // Y axis label
                dataset,
                PlotOrientation.VERTICAL,
                false, // No legend
                false, // No tooltips
                false  // No URLs
        );

        // Customize the chart
        customizeChart(chart, hasCurve ? curveData : null, finalValue, thresholdValue);

        // Enable anti-aliasing for smooth lines
        chart.setAntiAlias(true);
        chart.setTextAntiAlias(true);

        // Create the chart image at higher resolution for better quality
        // Use ChartRenderingInfo to get actual plot area bounds
        org.jfree.chart.ChartRenderingInfo renderInfo = new org.jfree.chart.ChartRenderingInfo();
        BufferedImage chartImage = chart.createBufferedImage(RENDER_WIDTH, RENDER_PLOT_HEIGHT, renderInfo);

        // Get plot area bounds for label centering
        java.awt.geom.Rectangle2D plotArea = renderInfo.getPlotInfo().getDataArea();

        // Create the final image with space for label below
        BufferedImage image = new BufferedImage(RENDER_WIDTH, RENDER_HEIGHT, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = image.createGraphics();
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        // Fill background with white
        g2d.setColor(BACKGROUND_COLOR);
        g2d.fillRect(0, 0, RENDER_WIDTH, RENDER_HEIGHT);

        // Draw the chart in the top portion
        g2d.drawImage(chartImage, 0, 0, null);

        // Draw the figure label centered under the plot area (not the full image)
        int fontSize = 9 * SCALE_FACTOR;
        g2d.setFont(new Font("SansSerif", Font.PLAIN, fontSize));
        g2d.setColor(Color.BLACK);

        String figureLabel = "Figure " + figureNumber + ":" + testCode;
        FontMetrics fm = g2d.getFontMetrics();
        int labelWidth = fm.stringWidth(figureLabel);

        // Center the label relative to the plot area
        int plotCenterX = (int) (plotArea.getX() + plotArea.getWidth() / 2);
        int x = plotCenterX - labelWidth / 2;
        int y = RENDER_PLOT_HEIGHT + (RENDER_LABEL_HEIGHT / 2) + (fm.getAscent() / 2);
        g2d.drawString(figureLabel, x, y);
        g2d.dispose();

        return image;
    }

    /**
     * Customize the chart appearance to match the reference form.
     */
    private static void customizeChart(JFreeChart chart, List<Double> curveData, Double finalValue, Double thresholdValue) {
        chart.setBackgroundPaint(BACKGROUND_COLOR);
        chart.setBorderVisible(false);

        XYPlot plot = chart.getXYPlot();
        plot.setBackgroundPaint(AXIS_BACKGROUND);
        plot.setDomainGridlinePaint(GRID_COLOR);
        plot.setRangeGridlinePaint(GRID_COLOR);
        plot.setOutlineVisible(true);
        plot.setOutlinePaint(Color.BLACK);

        // Configure X axis (cycles)
        NumberAxis xAxis = (NumberAxis) plot.getDomainAxis();
        xAxis.setRange(X_MIN, X_MAX);
        xAxis.setTickUnit(new org.jfree.chart.axis.NumberTickUnit(8));
        xAxis.setTickLabelFont(new Font("SansSerif", Font.PLAIN, 8 * SCALE_FACTOR));
        xAxis.setTickMarksVisible(true);

        // Configure Y axis (fluorescence)
        NumberAxis yAxis = (NumberAxis) plot.getRangeAxis();
        yAxis.setTickLabelFont(new Font("SansSerif", Font.PLAIN, 8 * SCALE_FACTOR));
        yAxis.setAutoRangeIncludesZero(false);

        // Format Y-axis numbers with commas (e.g., "1,943.21")
        NumberFormat formatter = new DecimalFormat("#,##0.##");
        yAxis.setNumberFormatOverride(formatter);

        double[] yRange = yAxisRange(curveData, thresholdValue);
        yAxis.setRange(yRange[0], yRange[1]);
        double range = (yRange[1] - yRange[0]) / 1.2;

        // Set nice tick units
        double tickUnit = calculateTickUnit(range);
        yAxis.setTickUnit(new org.jfree.chart.axis.NumberTickUnit(tickUnit));

        // Configure renderer for 3 series
        XYLineAndShapeRenderer renderer = new XYLineAndShapeRenderer();

        // Series 0: Curve data (blue line)
        renderer.setSeriesPaint(0, CURVE_COLOR);
        renderer.setSeriesStroke(0, new BasicStroke(1.5f * SCALE_FACTOR));
        renderer.setSeriesShapesVisible(0, false);
        renderer.setSeriesLinesVisible(0, true);

        // Series 1: Result (green solid line)
        renderer.setSeriesPaint(1, RESULT_LINE_COLOR);
        renderer.setSeriesStroke(1, new BasicStroke(2.0f * SCALE_FACTOR));
        renderer.setSeriesShapesVisible(1, false);
        renderer.setSeriesLinesVisible(1, true);

        // Series 2: Threshold (red dashed line)
        renderer.setSeriesPaint(2, THRESHOLD_COLOR);
        renderer.setSeriesStroke(2, new BasicStroke(1.5f * SCALE_FACTOR, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10.0f, new float[]{5.0f * SCALE_FACTOR}, 0.0f));
        renderer.setSeriesShapesVisible(2, false);
        renderer.setSeriesLinesVisible(2, true);

        plot.setRenderer(renderer);

        if (finalValue != null) {
            addValueLabel(plot, finalValue, new Color(0, 100, 0), thresholdValue == null || finalValue > thresholdValue);
        }
        if (thresholdValue != null) {
            addValueLabel(plot, thresholdValue, new Color(180, 0, 0), finalValue == null || thresholdValue >= finalValue);
        }
    }

    /** A value label on a line; the upper line is labelled above it, the lower one below. */
    private static void addValueLabel(XYPlot plot, double value, Color color, boolean above) {
        org.jfree.chart.plot.ValueMarker marker = new org.jfree.chart.plot.ValueMarker(value);
        marker.setPaint(new Color(0, 0, 0, 0)); // Invisible line (the series draws it)
        marker.setLabel(String.format("%,.1f", value));
        marker.setLabelFont(new Font("SansSerif", Font.BOLD, 9 * SCALE_FACTOR));
        marker.setLabelPaint(color);
        marker.setLabelAnchor(above ? org.jfree.chart.ui.RectangleAnchor.TOP_LEFT
                : org.jfree.chart.ui.RectangleAnchor.BOTTOM_LEFT);
        marker.setLabelTextAnchor(above ? org.jfree.chart.ui.TextAnchor.BOTTOM_LEFT
                : org.jfree.chart.ui.TextAnchor.TOP_LEFT);
        plot.addRangeMarker(marker);
    }

    /** Smallest y span drawn, in RFU, so baseline noise stays flat instead of filling the plot. */
    private static final double MIN_Y_SPAN = 300;

    /** The device's threshold for this curve, or null: no line is drawn without one. */
    static Double thresholdLine(PcrParameter parameter) {
        return parameter.getThreshold();
    }

    /** Y axis {lower, upper}: the curve and threshold, at least MIN_Y_SPAN tall, with 10% padding. */
    static double[] yAxisRange(List<Double> curveData, Double thresholdValue) {
        double minY = Double.POSITIVE_INFINITY;
        double maxY = Double.NEGATIVE_INFINITY;
        if (curveData != null) {
            for (double v : curveData) {
                minY = Math.min(minY, v);
                maxY = Math.max(maxY, v);
            }
        }
        if (thresholdValue != null) {
            minY = Math.min(minY, thresholdValue);
            maxY = Math.max(maxY, thresholdValue);
        }
        if (Double.isInfinite(minY)) {
            minY = 0;
            maxY = MIN_Y_SPAN;
        }
        if (maxY - minY < MIN_Y_SPAN) {
            maxY = minY + MIN_Y_SPAN;
        }
        double padding = (maxY - minY) * 0.1;
        return new double[]{minY - padding, maxY + padding};
    }

    /**
     * Calculate a nice tick unit for the Y axis.
     */
    private static double calculateTickUnit(double range) {
        if (range <= 100) return 25;
        if (range <= 500) return 100;
        if (range <= 1000) return 200;
        if (range <= 5000) return 1000;
        if (range <= 10000) return 2000;
        return 5000;
    }

    /**
     * Get the chart width.
     */
    public static int getChartWidth() {
        return CHART_WIDTH;
    }

    /**
     * Get the chart height.
     */
    public static int getChartHeight() {
        return CHART_HEIGHT;
    }
}
