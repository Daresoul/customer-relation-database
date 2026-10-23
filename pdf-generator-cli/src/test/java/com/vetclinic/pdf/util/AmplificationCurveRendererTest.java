package com.vetclinic.pdf.util;

import com.vetclinic.pdf.models.parameters.PcrParameter;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AmplificationCurveRendererTest {

    private static final List<Double> FLAT_NOISE = Arrays.asList(
            640.0, 636.0, 636.0, 639.0, 636.0, 640.0, 636.0, 643.0, 639.0, 638.0, 642.0, 646.0);

    private static PcrParameter withCurve(List<Double> curve) {
        PcrParameter p = new PcrParameter();
        p.setName("TOX");
        p.setCurveData(curve);
        return p;
    }

    @Test
    void thresholdComesFromTheDevice() {
        PcrParameter p = withCurve(FLAT_NOISE);
        p.setThreshold(775.2);
        assertEquals(775.2, AmplificationCurveRenderer.thresholdLine(p), 1e-9);
    }

    @Test
    void noDeviceThresholdMeansNoLine() {
        assertNull(AmplificationCurveRenderer.thresholdLine(withCurve(FLAT_NOISE)));
    }

    @Test
    void flatNoiseIsNotStretchedToFullHeight() {
        double[] y = AmplificationCurveRenderer.yAxisRange(FLAT_NOISE, null);
        double noiseSpan = 646 - 636;
        assertTrue((y[1] - y[0]) >= 20 * noiseSpan, "y span " + (y[1] - y[0]) + " stretches 10 RFU of noise");
        assertTrue(y[0] <= 636 && y[1] >= 646);
    }

    @Test
    void axisIncludesTheDeviceThreshold() {
        double[] y = AmplificationCurveRenderer.yAxisRange(FLAT_NOISE, 775.2);
        assertTrue(y[1] > 775.2, "upper " + y[1]);
    }

    @Test
    void realAmplificationKeepsItsShape() {
        List<Double> rising = Arrays.asList(900.0, 905.0, 1200.0, 2400.0, 5200.0, 6100.0);
        double[] y = AmplificationCurveRenderer.yAxisRange(rising, 943.0);
        assertTrue(y[0] <= 900 && y[1] >= 6100);
        assertTrue((y[1] - y[0]) < 2 * (6100 - 900));
    }

    // gaps M1: points were spread evenly over cycles 8-40, so a rise at Ct 20
    // was drawn near cycle 23. One point per cycle, from the first cycle.
    @Test
    void eachPointIsDrawnAtItsOwnCycle() {
        assertEquals(1.0, AmplificationCurveRenderer.cycleFor(0), 1e-9);
        assertEquals(32.0, AmplificationCurveRenderer.cycleFor(31), 1e-9);
        assertEquals(41.0, AmplificationCurveRenderer.cycleFor(40), 1e-9);
    }

    @Test
    void cycleAxisFollowsTheData() {
        assertArrayEquals(new double[]{1, 41}, AmplificationCurveRenderer.xAxisRange(41), 1e-9);
        assertArrayEquals(new double[]{1, 12}, AmplificationCurveRenderer.xAxisRange(12), 1e-9);
        double[] none = AmplificationCurveRenderer.xAxisRange(0);
        assertTrue(none[1] > none[0]);
    }

    @Test
    void singlePointAndEmptyCurvesRender() {
        assertNotNull(AmplificationCurveRenderer.renderCurve(withCurve(Arrays.asList(640.0)), 1));
        assertNotNull(AmplificationCurveRenderer.renderCurve(withCurve(Arrays.asList()), 1));
        assertNotNull(AmplificationCurveRenderer.renderCurve(withCurve(Arrays.asList(640.0, 640.0, 640.0)), 1));
    }
}
