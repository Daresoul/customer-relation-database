package com.vetclinic.pdf;

import com.itextpdf.text.BaseColor;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.Font;
import com.itextpdf.text.pdf.BaseFont;
import com.vetclinic.pdf.constants.Constants;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Loads the Macedonian-capable font used to render Cyrillic text in PDFs.
 *
 * History / bug-fix context:
 *   Pre-fix, this class called BaseFont.createFont(absPath, "Cp1251")
 *   where absPath came from URL.toURI().toString() inside the bundled JAR.
 *   Two problems:
 *     1. The relative resource path "assets/fonts/probaPro/..." was
 *        resolved via Util.class.getResource(...), which anchors paths
 *        to the calling class's package (com/vetclinic/pdf/util/). The
 *        actual font lives at com/vetclinic/pdf/assets/fonts/... so the
 *        resource was never found and getAbsolutePath returned "".
 *     2. Even if loading had worked, the Cp1251 encoding is the legacy
 *        Windows Cyrillic codepage — Macedonian text containing characters
 *        outside Windows-1251 (or anything mixed with Latin) would render
 *        as boxes / missing glyphs.
 *   Symptoms in release builds: Macedonian Cyrillic in generated PDFs
 *   appeared as Helvetica fallback with missing glyphs (the font load
 *   failed silently because the catch block was just e.printStackTrace()
 *   and the null MACEDONIAN_FONT was wrapped in an iText Font that
 *   silently downgrades).
 *
 * The fix:
 *   - Load the font as a byte[] via getResourceAsStream from an absolute
 *     classpath ("/com/vetclinic/pdf/assets/fonts/..."). Works the same
 *     way in the IDE (filesystem) and in the bundled JAR (zip entry).
 *   - Use Identity-H encoding — iText's name for "use the font's CID
 *     Unicode mappings". Supports every codepoint the .otf has glyphs
 *     for, not just the Cp1251 subset.
 *   - Log a SEVERE error if the font fails to load, instead of silently
 *     falling back. Future regressions will surface in logs / Sentry
 *     rather than as mystery missing glyphs in customer PDFs.
 */
public class FontUtil {

    private static BaseFont MACEDONIAN_FONT;
    private static final int DEFAULT_FONT = 15;
    public static final int MACEDONIAN = 0;
    public static final BaseColor DEFAULT_FONT_COLOR = BaseColor.DARK_GRAY;
    public static final BaseColor CYAN_DARK_FONT_COLOR = Util.CYAN_DARK_COLOR;
    public static final BaseColor OKAY_RESULT_FONT_COLOR = Util.CYAN_COLOR;
    public static final BaseColor BAD_RESULT_FONT_COLOR = Util.RED_COLOR;

    /** Absolute classpath of the embedded Unicode-capable font. The
     *  leading slash is critical — without it the lookup would be
     *  resolved relative to FontUtil's package, which doesn't contain
     *  the assets/ subtree. */
    private static final String MACEDONIAN_FONT_CLASSPATH =
        "/com/vetclinic/pdf/" + Constants.PROBA_PRO_FONT;

    private static final Logger logger = Logger.getLogger(FontUtil.class.getName());

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

        BaseFont loaded = loadMacedonianFontFromClasspath();
        if (loaded == null) {
            // Loud, recoverable fallback. iText's Font(size) returns a
            // Helvetica with no embedded font program — Cyrillic glyphs
            // will be missing in the resulting PDF, but the rest of the
            // document still renders so the user gets *something* to
            // hand to the vet, plus a clear log line for triage.
            logger.severe("Macedonian font unavailable — rendering with default font; "
                + "Cyrillic glyphs will be missing.");
            return new Font(Font.FontFamily.HELVETICA, size, Font.NORMAL, color);
        }

        MACEDONIAN_FONT = loaded;
        return new Font(MACEDONIAN_FONT, size, Font.UNDEFINED, color);
    }

    /**
     * Read the embedded .otf out of the JAR as a byte[] and hand the
     * bytes to iText. This is the canonical pattern for loading fonts
     * out of a packaged Java artifact — file-path-based loading fails
     * the moment the resource is inside a jar:// URL because not every
     * iText version handles those URLs end-to-end.
     */
    private static BaseFont loadMacedonianFontFromClasspath() {
        try (InputStream in = FontUtil.class.getResourceAsStream(MACEDONIAN_FONT_CLASSPATH)) {
            if (in == null) {
                logger.severe("Macedonian font not found on classpath: "
                    + MACEDONIAN_FONT_CLASSPATH);
                return null;
            }

            byte[] fontBytes = readAllBytes(in);
            // Identity-H = "use the font's CID-keyed Unicode mappings".
            // EMBEDDED = embed the font program in the PDF (so the file
            // renders identically on any machine, regardless of locally
            // installed fonts). CACHED = let iText reuse the parsed
            // font program between calls.
            //
            // The first argument is the font name used in the PDF's
            // /BaseFont entry. It doesn't need to match a real file
            // path when the bytes are supplied directly — it's just a
            // label, so we use the .otf filename for diagnostic
            // friendliness.
            return BaseFont.createFont(
                "Mint Type - Proba Pro Regular.otf",
                BaseFont.IDENTITY_H,
                BaseFont.EMBEDDED,
                BaseFont.CACHED,
                fontBytes,
                null
            );
        } catch (IOException | DocumentException e) {
            logger.log(Level.SEVERE, "Failed to load Macedonian font from "
                + MACEDONIAN_FONT_CLASSPATH, e);
            return null;
        }
    }

    /**
     * Java 8-compatible equivalent of InputStream.readAllBytes() (which
     * exists from Java 9+). The build targets Java 8 (sourceCompatibility
     * in build.gradle) so we can't use the standard library version.
     */
    private static byte[] readAllBytes(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) != -1) {
            buf.write(chunk, 0, n);
        }
        return buf.toByteArray();
    }
}
