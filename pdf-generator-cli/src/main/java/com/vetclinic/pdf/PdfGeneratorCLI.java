package com.vetclinic.pdf;

import com.google.gson.*;
import com.vetclinic.pdf.constants.*;
import com.vetclinic.pdf.constants.parameters.HealvetParameterEnum;
import com.vetclinic.pdf.models.Patient;
import com.vetclinic.pdf.models.parameters.HealvetParameter;
import com.vetclinic.pdf.models.parameters.Parameter;
import com.vetclinic.pdf.models.parameters.PcrParameter;
import com.vetclinic.pdf.models.samples.*;
import com.vetclinic.pdf.services.PDFReportService;
import com.vetclinic.pdf.util.ResultClassifier;

import java.io.File;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CLI entry point for PDF generation
 *
 * Usage: pdf-generator input.json
 *
 * Input JSON format:
 * {
 *   "patient": {
 *     "name": "Fluffy",
 *     "owner": "John Doe",
 *     "species": "Dog",
 *     "microchip_id": "123456",
 *     "gender": "Female",                 // Male/Female (en or mk); anything else prints as unknown
 *     "date_of_birth": "2020-01-15"       // ISO yyyy-MM-dd or null
 *   },
 *   "samples": [
 *     {
 *       "device_type": "exigo_eos_vet",
 *       "sample_id": "12345",
 *       "test_results": { "RBC": "5.2", "HGB": "14.5", ... },
 *       "detected_at": "2025-10-14T10:30:00Z",          // receive instant (fallback)
 *       "analysis_datetime": "2025-10-14T12:28:41",     // analyzer clock, local wall time
 *       "patient_id": "123456"
 *     }
 *   ],
 *   "output_path": "/path/to/output.pdf"
 * }
 */
public class PdfGeneratorCLI {

    public static void main(String[] args) {
        // Force UTF-8 on stdout/stderr regardless of platform default
        // (Windows defaults to the system code page, e.g. CP-1251 for Cyrillic
        // locales, which mangles non-ASCII path/text output the Rust side
        // reads back as UTF-8). The String-charset PrintStream overload is
        // used for Java 8 compatibility; the Charset overload is Java 10+.
        try {
            System.setOut(new PrintStream(System.out, true, "UTF-8"));
            System.setErr(new PrintStream(System.err, true, "UTF-8"));
        } catch (java.io.UnsupportedEncodingException e) {
            // UTF-8 is required by every JVM, so this is unreachable.
        }

        // Report the version this JAR was built for, so the Rust host can detect
        // a stale JAR left behind by a partially-applied update (app binary
        // updated, resources/pdf-generator.jar not). Prints the manifest's
        // Implementation-Version (set from -PappVersion at release build time),
        // or "dev" for local builds. Kept before the usage check so it needs no
        // input file.
        if (args.length == 1 && "--version".equals(args[0])) {
            String v = PdfGeneratorCLI.class.getPackage().getImplementationVersion();
            System.out.println(v != null ? v : "dev");
            return;
        }

        if (args.length != 1) {
            System.err.println("Usage: pdf-generator <input.json>  |  pdf-generator --version");
            System.exit(1);
        }

        try {
            String inputPath = args[0];
            // Read JSON as UTF-8 — the Rust side always writes UTF-8.
            // Without an explicit charset, `new String(bytes)` uses the
            // platform default and corrupts non-ASCII content (e.g. Cyrillic
            // patient names in output_path), causing the PDF to be written
            // to a different path than Rust expects.
            String jsonContent = new String(Files.readAllBytes(Paths.get(inputPath)), StandardCharsets.UTF_8);

            Gson gson = new Gson();
            JsonObject json = gson.fromJson(jsonContent, JsonObject.class);

            generate(json);

        } catch (Exception e) {
            System.err.println("Error generating PDF: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    static void generate(JsonObject json) throws Exception {
        // Check report type - default to "device" for backwards compatibility
        String reportType = "device";
        if (json.has("report_type") && !json.get("report_type").isJsonNull()) {
            reportType = json.get("report_type").getAsString();
        }

        PDFReportService service = PDFReportService.getInstance();
        service.setClinic(com.vetclinic.pdf.models.ClinicProfile.fromJson(json));
        service.setDocumentDate(getStr(json, "date", null));
        String outputPath = json.get("output_path").getAsString();

        if ("invoice".equals(reportType)) {
            // Invoice mode - uses invoice.pdf template with dynamic table
            String invoiceDate = json.has("date") ? json.get("date").getAsString() : "";
            String invoiceNumber = json.has("invoice_number") ? json.get("invoice_number").getAsString() : "";
            String recipient = json.has("recipient") ? json.get("recipient").getAsString() : "";
            double discountPercent = json.has("discount_percent") ? json.get("discount_percent").getAsDouble() : 0;
            String currency = json.has("currency") ? json.get("currency").getAsString() : "ден";

            // Parse line items
            List<PDFReportService.InvoiceLineItem> lineItems = new ArrayList<>();
            if (json.has("line_items") && json.get("line_items").isJsonArray()) {
                JsonArray itemsArray = json.getAsJsonArray("line_items");
                for (JsonElement itemEl : itemsArray) {
                    JsonObject itemObj = itemEl.getAsJsonObject();
                    String name = itemObj.has("name") ? itemObj.get("name").getAsString() : "";
                    int quantity = itemObj.has("quantity") ? itemObj.get("quantity").getAsInt() : 1;
                    double unitPrice = itemObj.has("unit_price") ? itemObj.get("unit_price").getAsDouble() : 0;
                    String vatLabel = getStr(itemObj, "vat_label", null);
                    String description = getStr(itemObj, "description", null);
                    lineItems.add(new PDFReportService.InvoiceLineItem(name, quantity, unitPrice, vatLabel, description));
                }
            }

            File pdfFile = service.createInvoice(invoiceDate, invoiceNumber, recipient,
                lineItems, discountPercent, currency, parseInvoiceTotals(json), outputPath);
            System.out.println("Invoice PDF generated successfully: " + outputPath);

        } else if ("pharmacy_note".equals(reportType)) {
            // Pharmacy note mode - overlays prescription text on pharmacy_note.pdf template
            String prescriptionText = json.has("prescription_text") ? json.get("prescription_text").getAsString() : "";

            File pdfFile = service.createPharmacyNote(prescriptionText, outputPath);
            System.out.println("Pharmacy note PDF generated successfully: " + outputPath);

        } else if ("simple".equals(reportType)) {
            // Simple report mode - uses template with title and description
            String title = json.has("title") ? json.get("title").getAsString() : "";
            String description = json.has("description") ? json.get("description").getAsString() : "";

            // Patient info (all optional)
            String patientName = null;
            String ownerName = null;
            String species = null;
            String microchipId = null;
            String gender = null;
            String dateOfBirth = null;

            if (json.has("patient") && !json.get("patient").isJsonNull()) {
                JsonObject patientJson = json.getAsJsonObject("patient");
                if (patientJson.has("name") && !patientJson.get("name").isJsonNull()) {
                    patientName = patientJson.get("name").getAsString();
                }
                if (patientJson.has("owner") && !patientJson.get("owner").isJsonNull()) {
                    ownerName = patientJson.get("owner").getAsString();
                }
                if (patientJson.has("species") && !patientJson.get("species").isJsonNull()) {
                    species = patientJson.get("species").getAsString();
                }
                if (patientJson.has("microchip_id") && !patientJson.get("microchip_id").isJsonNull()) {
                    microchipId = patientJson.get("microchip_id").getAsString();
                }
                if (patientJson.has("gender") && !patientJson.get("gender").isJsonNull()) {
                    gender = patientJson.get("gender").getAsString();
                }
                if (patientJson.has("date_of_birth") && !patientJson.get("date_of_birth").isJsonNull()) {
                    dateOfBirth = patientJson.get("date_of_birth").getAsString();
                }
            }

            File pdfFile;
            boolean hasPatientInfo = patientName != null || ownerName != null || species != null ||
                                     microchipId != null || gender != null || dateOfBirth != null;
            if (hasPatientInfo) {
                pdfFile = service.createSimpleReportWithPatient(title, description,
                    patientName, ownerName, species, microchipId, gender, dateOfBirth, outputPath);
            } else {
                pdfFile = service.createSimpleReport(title, description, outputPath);
            }
            System.out.println("Simple report PDF generated successfully: " + outputPath);

        } else {
            // Device report mode (default) - existing behavior
            // Parse patient
            Patient patient = parsePatient(json.getAsJsonObject("patient"));

            // Parse samples (pass patient type for Healvet reference ranges)
            List<Sample> samples = parseSamples(json.getAsJsonArray("samples"), patient.getPatientType());

            // Generate PDF using existing service
            File pdfFile = service.createPDFReport(patient, samples, outputPath);

            System.out.println("Device report PDF generated successfully: " + outputPath);
        }

    }

    /** The optional `totals` object of an invoice; null when the app did not send it. */
    static PDFReportService.InvoiceTotals parseInvoiceTotals(JsonObject json) {
        if (!json.has("totals") || !json.get("totals").isJsonObject()) {
            return null;
        }
        JsonObject t = json.getAsJsonObject("totals");
        List<PDFReportService.VatGroup> groups = new ArrayList<>();
        if (t.has("vat_groups") && t.get("vat_groups").isJsonArray()) {
            for (JsonElement el : t.getAsJsonArray("vat_groups")) {
                JsonObject g = el.getAsJsonObject();
                groups.add(new PDFReportService.VatGroup(getStr(g, "label", ""),
                        num(g, "net"), num(g, "vat"), num(g, "gross")));
            }
        }
        boolean pricesIncludeVat = !t.has("prices_include_vat") || t.get("prices_include_vat").isJsonNull()
                || t.get("prices_include_vat").getAsBoolean();
        return new PDFReportService.InvoiceTotals(num(t, "subtotal"), num(t, "discount_amount"),
                num(t, "total"), num(t, "vat_total"), pricesIncludeVat, groups);
    }

    private static double num(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsDouble() : 0;
    }

    static Patient parsePatient(JsonObject json) {
        Patient patient = new Patient();
        patient.setName(json.get("name").getAsString());

        // Handle owner - may be null or empty
        if (json.has("owner") && !json.get("owner").isJsonNull()) {
            String owner = json.get("owner").getAsString();
            patient.setOwner(owner != null ? owner : "");
        } else {
            patient.setOwner("");
        }

        // Map species string to PatientType
        String species = json.get("species").getAsString().toLowerCase();
        if (species.contains("dog") || species.contains("куче")) {
            patient.setPatientType(PatientType.DOG);
        } else if (species.contains("cat") || species.contains("мачка")) {
            patient.setPatientType(PatientType.CAT);
        } else {
            patient.setPatientType(PatientType.DOG); // Default to DOG
        }

        if (json.has("microchip_id") && !json.get("microchip_id").isJsonNull()) {
            patient.setPatientIdMicrochip(json.get("microchip_id").getAsString());
        }

        String gender = json.has("gender") && !json.get("gender").isJsonNull()
                ? json.get("gender").getAsString() : null;
        patient.setGender(Gender.fromPatientValue(gender));

        if (json.has("date_of_birth") && !json.get("date_of_birth").isJsonNull()) {
            String dobString = json.get("date_of_birth").getAsString();
            patient.setDateOfBirth(com.vetclinic.pdf.Util.parseDateStringRepresentation(dobString));
        }

        return patient;
    }

    private static final java.time.format.DateTimeFormatter ANALYSIS_DISPLAY =
            java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    /**
     * The analysis time as printed: the analyzer's own clock (`analysis_datetime`,
     * local wall time) when sent, else the receive instant (`detected_at`)
     * in this machine's zone. Never a raw ISO/UTC string.
     */
    static String analysisDisplayDate(JsonObject sampleJson) {
        String local = getStr(sampleJson, "analysis_datetime", null);
        if (local != null) {
            try {
                return java.time.LocalDateTime.parse(local).format(ANALYSIS_DISPLAY);
            } catch (java.time.format.DateTimeParseException e) {
                System.err.println("PDF_WARN code=bad_analysis_datetime value='" + local + "'");
            }
        }
        String instant = getStr(sampleJson, "detected_at", null);
        if (instant == null) {
            return "";
        }
        try {
            return java.time.OffsetDateTime.parse(instant)
                    .atZoneSameInstant(java.time.ZoneId.systemDefault())
                    .format(ANALYSIS_DISPLAY);
        } catch (java.time.format.DateTimeParseException e) {
            System.err.println("PDF_WARN code=bad_detected_at value='" + instant + "'");
            return "";
        }
    }

    static List<Sample> parseSamples(JsonArray samplesJson, PatientType patientType) {
        List<Sample> samples = new ArrayList<>();

        for (JsonElement element : samplesJson) {
            JsonObject sampleJson = element.getAsJsonObject();
            String deviceType = sampleJson.get("device_type").getAsString();

            Sample sample = null;

            switch (deviceType) {
                case "exigo_eos_vet":
                    sample = parseExigoSample(sampleJson);
                    break;
                case "pointcare":
                    sample = parsePointcareSample(sampleJson);
                    break;
                case "pcr":
                    sample = parsePcrSample(sampleJson);
                    break;
                case "healvet":
                case "healvet_hv_fia_3000":
                    sample = parseHealvetSample(sampleJson, patientType);
                    break;
                default:
                    System.err.println("Unknown device type: " + deviceType);
                    continue;
            }

            if (sample != null) {
                // One machine-greppable line per sample. The Rust caller logs
                // this stdout into Arkivet.log (shipped to Loki), so "how many
                // rows did each device table get?" is answerable remotely.
                // params=0 means that device's table rendered header-only.
                int paramCount = (sample instanceof PcrSample)
                        ? ((PcrSample) sample).getPcrParameters().size()
                        : (sample.getParameters() == null) ? 0 : sample.getParameters().size();
                System.out.println("PARSED_SAMPLE device=" + deviceType
                        + " sample_id=" + sample.getSampleId()
                        + " params=" + paramCount);
                // A sample with zero parameters would render a header-only
                // table on a report that otherwise looks complete — the same
                // silently-empty failure the Rust side guards against. Refuse
                // (exit 1, logged by the Rust caller) rather than emit it. This
                // also catches key-shape mismatches between Rust and this JAR
                // that the Rust-side non-empty check cannot see.
                if (paramCount == 0) {
                    throw new IllegalStateException(
                            "Sample for device '" + deviceType + "' parsed to 0 parameters — "
                            + "refusing to render a report with an empty results table");
                }
                samples.add(sample);
            }
        }

        return samples;
    }

    private static ExigoSample parseExigoSample(JsonObject json) {
        ExigoSample sample = new ExigoSample();
        sample.setSampleId(json.get("sample_id").getAsString());
        sample.setPatientId(json.get("patient_id").getAsString());
        sample.setAnalysisDateAndTime(analysisDisplayDate(json));

        // Parse test results into parameters
        JsonObject testResults = json.getAsJsonObject("test_results");
        List<Parameter> parameters = new ArrayList<>();

        // Exigo parameter order (matching Rust version and print-app spec)
        String[][] parameterOrder = {
            {"PLT", "PLT - тромбоцити", "10e+9/L"},
            {"MPV", "MPV", "fL"},
            {"HGB", "HGB - хемоглобин", "g/dL"},
            {"WBC", "WBC - леукоцити", "10e+9/L"},
            {"LA", "LA - лимфоцити", "10e+9/L"},
            {"MA", "MA - моноцити", "10e+9/L"},
            {"GA", "NEUT - неутрофили", "10e+9/L"},
            {"LR", "LR - лимфоцити %", "%"},
            {"MR", "MR - моноцити %", "%"},
            {"GR", "GR - гранулоцити %", "%"},
            {"EA", "EA - еозинофили", "10e+9/L"},
            {"ER", "ER - еозинофили %", "%"},
            {"RBC", "RBC - еритроцити", "10e+12/L"},
            {"MCV", "MCV", "fL"},
            {"HCT", "HCT - хематокрит", "%"},
            {"MCH", "MCH", "pg"},
            {"MCHC", "MCHC", "g/dL"},
            {"RDWR", "RDW %", "%"},
            {"RDWA", "RDW", "fL"}
        };

        for (String[] param : parameterOrder) {
            String key = param[0];
            if (testResults.has(key)) {
                Parameter parameter = new Parameter();
                parameter.setName(param[1]);
                parameter.setResult(testResults.get(key).getAsString());
                parameter.setUnit(param[2]);

                // Extract reference values from _L and _H keys
                String refLowKey = key + "_L";
                String refHighKey = key + "_H";
                String referenceValues = "";

                if (testResults.has(refLowKey) && testResults.has(refHighKey)) {
                    String refLow = testResults.get(refLowKey).getAsString();
                    String refHigh = testResults.get(refHighKey).getAsString();
                    referenceValues = refLow + " - " + refHigh;
                }

                parameter.setReferentValues(referenceValues);

                Indicator indicator = indicatorFromFlag(getStr(testResults, key + "_F", null));
                if (indicator == null) {
                    indicator = ResultClassifier.classify(parameter.getResult(),
                            ResultClassifier.parseNumber(getStr(testResults, refLowKey, null)),
                            ResultClassifier.parseNumber(getStr(testResults, refHighKey, null)));
                }
                parameter.setIndicator(indicator);

                parameters.add(parameter);
            }
        }

        sample.setParameters(parameters);
        return sample;
    }

    private static PointcareSample parsePointcareSample(JsonObject json) {
        PointcareSample sample = new PointcareSample();
        sample.setSampleId(json.get("sample_id").getAsString());
        sample.setPatientId(json.get("patient_id").getAsString());
        sample.setAnalysisDateAndTime(analysisDisplayDate(json));

        // Set sample type (default to SERUM for biochemistry)
        if (json.has("sample_type")) {
            String sampleTypeCode = json.get("sample_type").getAsString();
            SampleType sampleType = SampleType.getPointcareSampleTypeForCode(sampleTypeCode);
            sample.setSampleType(sampleType != null ? sampleType : SampleType.SERUM);
        } else {
            sample.setSampleType(SampleType.SERUM);
        }

        // Set test type
        if (json.has("test_type")) {
            String testType = json.get("test_type").getAsString();
            sample.setTestType(PointcareTestType.valueOf(testType));
        } else {
            sample.setTestType(PointcareTestType.HEALTH_CHECKING_PROFILE);
        }

        // Parse parameters with proper unit and reference value lookup
        JsonObject testResults = json.getAsJsonObject("test_results");
        List<Parameter> parameters = new ArrayList<>();

        // Units, reference ranges, and abnormal flags are taken from what the
        // DEVICE actually sent — the Rust parser captures them as `<code>_unit`,
        // `<code>_range`, `<code>_flag`. The table below supplies only the display
        // order, translated names, and a fallback for when the device omits
        // metadata. Previously this table was applied unconditionally in US units,
        // so an SI-configured analyzer (e.g. GLU in mmol/L, CRE in µmol/L) was
        // mislabeled "mg/dL" and mis-flagged against mg/dL ranges.
        // Format: {code, translated_name, fallback_unit, fallback_ref_low, fallback_ref_high}
        String[][] pointcareParams = {
            {"GLU", "GLU - гликоза", "mg/dL", "70", "110"},
            {"BUN", "BUN - уреа", "mg/dL", "7", "27"},
            {"CRE", "CRE - креатинин", "mg/dL", "0.5", "1.8"},
            {"ALB", "ALB - албумин", "g/dL", "2.3", "4.0"},
            {"TP", "TP - вк.протеини", "g/dL", "5.2", "8.2"},
            {"Ca", "Ca - калциум", "mg/dL", "9.0", "11.3"},
            {"P", "P - фосфор", "mg/dL", "2.5", "6.8"},
            {"ALT", "ALT", "U/L", "10", "100"},
            {"ALP", "ALP", "U/L", "23", "212"},
            {"TBIL", "TBIL - т.билирубин", "mg/dL", "0.0", "0.9"},
            {"CHOL", "CHOL - холестерол", "mg/dL", "110", "320"},
            {"AMY", "AMY - амилаза", "U/L", "500", "1500"},
            {"K+", "K+ калиум", "mmol/L", "3.5", "5.8"},
            {"Na+", "Na+ натриум", "mmol/L", "144", "160"},
            {"Cl-", "Cl- хлор", "mmol/L", "109", "122"},
            {"GLO", "GLO - глобулин", "g/dL", "2.5", "4.5"},
            {"CK", "CK - креатин киназа", "U/L", "10", "200"},
            {"BUN/CRE", "BUN/CRE", "", "", ""},
            {"A/G", "A/G", "", "", ""},
            {"AST", "AST", "U/L", "10", "50"},
            {"GGT", "GGT", "U/L", "0", "14"},
            {"DBIL", "DBIL - дир.билирубин", "mg/dL", "0.0", "0.3"},
            {"IBIL", "IBIL - индир.билирубин", "mg/dL", "0.0", "0.6"},
            {"Na+/K+", "Na+/K+", "", "", ""},
            {"CO2", "CO2 - јаг.диоксид", "mmol/L", "17", "24"},
            {"Mg", "Mg - магнезиум", "mg/dL", "1.6", "2.4"},
            {"TG", "TG - триглицериди", "mg/dL", "", ""},
            // Present in real PointCare output but previously dropped (surfaced by
            // the unmapped-analyte log). TBA (total bile acids) is a real result;
            // AST/ALT and Ca*P are derived ratios/products. Units/ranges come from
            // the device (fallbacks intentionally blank).
            {"TBA", "TBA - жолчни киселини", "", "", ""},
            {"AST/ALT", "AST/ALT", "", "", ""},
            {"Ca*P", "Ca*P", "", "", ""}
        };

        // Vendor spelling differences: device code -> canonical table code, so
        // analytes aren't silently dropped when the machine labels them slightly
        // differently than our table.
        Map<String, String> aliasToCanonical = new HashMap<>();
        aliasToCanonical.put("GLOB", "GLO");
        aliasToCanonical.put("TRIG", "TG");
        aliasToCanonical.put("Na", "Na+");
        aliasToCanonical.put("K", "K+");
        aliasToCanonical.put("Cl", "Cl-");
        aliasToCanonical.put("tCO2", "CO2");
        aliasToCanonical.put("TCO2", "CO2");
        // canonical code -> accepted device keys (itself first, then any aliases)
        Map<String, List<String>> deviceKeysFor = new HashMap<>();
        for (String[] def : pointcareParams) {
            deviceKeysFor.computeIfAbsent(def[0], k -> new ArrayList<>()).add(def[0]);
        }
        for (Map.Entry<String, String> e : aliasToCanonical.entrySet()) {
            deviceKeysFor.computeIfAbsent(e.getValue(), k -> new ArrayList<>()).add(e.getKey());
        }

        // Track which device keys we actually rendered, so we can warn about any
        // analyte the device sent that we didn't map (see the unmapped-code check
        // after the loop) instead of silently dropping it.
        java.util.Set<String> consumedKeys = new java.util.HashSet<>();

        // Process parameters in the table's display order.
        for (String[] paramDef : pointcareParams) {
            String canonical = paramDef[0];
            String deviceKey = null;
            for (String cand : deviceKeysFor.getOrDefault(canonical, java.util.Collections.singletonList(canonical))) {
                if (testResults.has(cand) && !testResults.get(cand).isJsonNull()) {
                    deviceKey = cand;
                    break;
                }
            }
            if (deviceKey == null) {
                continue;
            }
            consumedKeys.add(deviceKey);

            Parameter parameter = new Parameter();
            parameter.setName(paramDef[1]); // Translated name
            parameter.setResult(testResults.get(deviceKey).getAsString());

            // Unit: device-supplied, else table fallback.
            parameter.setUnit(getStr(testResults, deviceKey + "_unit", paramDef[2]));

            // Reference range: device-supplied (verbatim), else table low/high.
            String deviceRange = getStr(testResults, deviceKey + "_range", null);
            String refLow = paramDef[3];
            String refHigh = paramDef[4];
            if (deviceRange != null && isZeroRange(deviceRange)) {
                deviceRange = null;
            }
            if (deviceRange != null && !deviceRange.isEmpty()) {
                parameter.setReferentValues(deviceRange);
            } else if (!refLow.isEmpty() && !refHigh.isEmpty()) {
                parameter.setReferentValues(refLow + " - " + refHigh);
            } else {
                parameter.setReferentValues("");
            }

            // Indicator: trust the device's own flag first; only compute locally
            // (against whichever range we have) when the device sent none.
            Indicator indicator = indicatorFromFlag(getStr(testResults, deviceKey + "_flag", null));
            if (indicator == null) {
                indicator = computeIndicator(parameter.getResult(), deviceRange, refLow, refHigh);
            }
            parameter.setIndicator(indicator);

            parameters.add(parameter);
        }

        // Analyte codes the device sent that have no row. The app reads this
        // line and tells the user which values are not on the PDF.
        List<String> unmapped = new ArrayList<>();
        for (String key : testResults.keySet()) {
            if (!consumedKeys.contains(key) && !isMetadataKey(key)) {
                unmapped.add(key);
            }
        }
        if (!unmapped.isEmpty()) {
            java.util.Collections.sort(unmapped);
            System.err.println("PDF_WARN code=unmapped_analytes device=pointcare codes="
                    + String.join(",", unmapped));
        }

        sample.setParameters(parameters);
        return sample;
    }

    private static final java.util.regex.Pattern SEGMENT_FIELD_KEY =
            java.util.regex.Pattern.compile("^[A-Z][A-Z0-9]{2}_\\d+$");

    /**
     * Every PCR test code the device sent: any key that is not metadata or a
     * per-code suffix. Known codes keep the panel order, unknown ones follow
     * by name, and the internal control comes last.
     */
    static List<String> pcrCodes(JsonObject testResults) {
        List<String> known = new ArrayList<>();
        List<String> unknown = new ArrayList<>();
        String control = null;
        for (String key : testResults.keySet()) {
            if (isMetadataKey(key) || SEGMENT_FIELD_KEY.matcher(key).matches()
                    || testResults.get(key).isJsonNull()) {
                continue;
            }
            PcrTestCode code = PcrTestCode.fromCode(key);
            if (code == PcrTestCode.IC) {
                control = key;
            } else if (code != null) {
                known.add(key);
            } else {
                unknown.add(key);
            }
        }
        known.sort(java.util.Comparator.comparingInt(k -> PcrTestCode.fromCode(k).ordinal()));
        java.util.Collections.sort(unknown);
        List<String> codes = new ArrayList<>(known);
        codes.addAll(unknown);
        if (control != null) {
            codes.add(control);
        }
        return codes;
    }

    /**
     * True for HL7 metadata / non-result keys that shouldn't be treated as
     * droppable analytes: message headers (MSH/PID/OBR/...), patient fields, and
     * the per-analyte metadata suffixes (`_unit`, `_range`, `_flag`, etc.).
     */
    private static boolean isMetadataKey(String key) {
        if (key.endsWith("_unit") || key.endsWith("_range") || key.endsWith("_flag")
            || key.endsWith("_sample_type") || key.endsWith("_curve") || key.endsWith("_lot")
            || key.endsWith("_threshold")) {
            return true;
        }
        String[] prefixes = {
            "MSH_", "PID_", "OBR_", "OBX_", "message_", "sending_", "hl7_", "patient_",
        };
        for (String p : prefixes) {
            if (key.startsWith(p)) {
                return true;
            }
        }
        switch (key) {
            case "message_type":
            case "sample_type":
            case "test_code":
            case "test_datetime":
            case "sample_id":
            case "species":
            case "gender":
            case "gender_alt":
            case "birth_date":
            case "birth_date_alt":
                return true;
            default:
                return false;
        }
    }

    /** Devices send "0-0" for analytes that have no reference range. */
    static boolean isZeroRange(String range) {
        String r = range.trim().replace('–', '-');
        int dash = r.indexOf('-', 1);
        if (dash < 0) {
            return false;
        }
        Double low = ResultClassifier.parseNumber(r.substring(0, dash));
        Double high = ResultClassifier.parseNumber(r.substring(dash + 1));
        return low != null && high != null && low == 0 && high == 0;
    }

    /** Read a string field from the results object; returns {@code dflt} when absent, null, or empty. */
    private static String getStr(JsonObject o, String key, String dflt) {
        if (o.has(key) && !o.get(key).isJsonNull()) {
            String s = o.get(key).getAsString();
            if (!s.isEmpty()) {
                return s;
            }
        }
        return dflt;
    }

    /** Map a device HL7 abnormal-flag (N/H/L/HH/LL/&gt;/&lt;) to an Indicator; null if absent/unknown. */
    private static Indicator indicatorFromFlag(String flag) {
        if (flag == null) {
            return null;
        }
        String f = flag.trim().toUpperCase();
        if (f.isEmpty()) {
            return null;
        }
        if (f.startsWith("H") || f.startsWith(">")) {
            return Indicator.HIGH;
        }
        if (f.startsWith("L") || f.startsWith("<")) {
            return Indicator.LOW;
        }
        if (f.startsWith("N")) {
            return Indicator.NORMAL;
        }
        return null;
    }

    /**
     * Compare the value with the device-supplied range (preferred, "low-high")
     * or the table fallback. No readable range or value gives UNKNOWN, never NORMAL.
     */
    private static Indicator computeIndicator(String result, String deviceRange, String refLow, String refHigh) {
        Double[] range = ResultClassifier.parseRange(deviceRange);
        if (range == null) {
            range = new Double[]{ResultClassifier.parseNumber(refLow), ResultClassifier.parseNumber(refHigh)};
        }
        return ResultClassifier.classify(result, range[0], range[1]);
    }

    private static HealvetSample parseHealvetSample(JsonObject json, PatientType patientType) {
        HealvetSample sample = new HealvetSample();
        sample.setSampleId(json.get("sample_id").getAsString());
        sample.setPatientId(json.get("patient_id").getAsString());
        sample.setAnalysisDateAndTime(analysisDisplayDate(json));

        // Parse test results - Healvet stores each parameter as a key-value pair
        // where key is the parameter code (e.g., "TSH-1", "T4-1", "cCRP") and value is result
        JsonObject testResults = json.getAsJsonObject("test_results");
        List<Parameter> parameters = new ArrayList<>();

        // Process each parameter code in the test results
        for (String paramCode : testResults.keySet()) {
            // Skip metadata fields that may be present from HL7 parsing
            // These include PID segment fields and other non-test-result data
            if (paramCode.equals("sample_id") || paramCode.equals("patient_id") ||
                paramCode.equals("datetime") || paramCode.equals("gender") ||
                paramCode.equals("sample_type") ||
                // PID segment fields from HL7 parser
                paramCode.equals("set_id") || paramCode.equals("external_id") ||
                paramCode.equals("alternate_id") || paramCode.equals("patient_name") ||
                paramCode.equals("patientName") || paramCode.equals("species") ||
                paramCode.equals("birth_date_alt") || paramCode.equals("gender_alt") ||
                paramCode.equals("birth_date") || paramCode.equals("patient_address") ||
                paramCode.equals("phone") || paramCode.equals("patientIdentifier") ||
                // MSH segment fields
                paramCode.equals("sending_application") || paramCode.equals("sending_facility") ||
                paramCode.equals("receiving_application") || paramCode.equals("receiving_facility") ||
                paramCode.equals("message_datetime") || paramCode.equals("message_type") ||
                paramCode.equals("message_control_id") || paramCode.equals("processing_id") ||
                paramCode.equals("version_id") ||
                // OBR segment fields
                paramCode.equals("observation_datetime") || paramCode.equals("specimen_received_datetime") ||
                // Other common metadata
                paramCode.equals("name") || paramCode.equals("ID2") || paramCode.equals("APNA") ||
                // The test time and the parser's spare Healvet fields (field_10, ...)
                isMetadataKey(paramCode) || paramCode.startsWith("field_")) {
                continue;
            }

            String resultValue = testResults.get(paramCode).getAsString();

            // Try to look up the parameter in HealvetParameterEnum for proper name, unit, and ranges
            // Note: forCortisolIsBeforeACTHTest is null since we don't have that info from CLI
            HealvetParameterEnum healvetEnum = HealvetParameterEnum.getParameterByProperties(
                paramCode, patientType, null);

            if (healvetEnum != null) {
                // Use HealvetParameter which auto-populates name, unit, and reference values
                HealvetParameter parameter = new HealvetParameter();
                parameter.setResult(resultValue); // Set result first
                parameter.setHealvetParameterEnum(healvetEnum); // This sets name, unit, referentValues, and indicator
                parameters.add(parameter);
            } else {
                // Fallback: create basic parameter if enum lookup fails
                System.err.println("Warning: No HealvetParameterEnum found for code '" + paramCode +
                    "' with patient type " + patientType.getCode());
                Parameter parameter = new Parameter();
                parameter.setName(paramCode);
                parameter.setResult(resultValue);
                parameter.setIndicator(Indicator.UNKNOWN);
                parameters.add(parameter);
            }
        }

        sample.setParameters(parameters);
        return sample;
    }

    /**
     * Parse a PCR sample from JSON.
     * Expected format:
     * {
     *   "device_type": "pcr",
     *   "sample_id": "0C1231-3-0015",
     *   "patient_id": "555",
     *   "detected_at": "2025-12-30T13:38:51",
     *   "test_results": {
     *     "CDV": "NoCt",
     *     "CDV_curve": "643#640#642#...",
     *     "CDV_range": ">36 or NoCt",
     *     "CDV_sample_type": "oral_nasal_ocular swab",
     *     "CDV_lot": "250850",
     *     ...
     *   }
     * }
     */
    private static PcrSample parsePcrSample(JsonObject json) {
        PcrSample sample = new PcrSample();
        sample.setSampleId(json.get("sample_id").getAsString());
        sample.setPatientId(json.get("patient_id").getAsString());
        sample.setAnalysisDateAndTime(analysisDisplayDate(json));

        // Set analyzer info from sample_id if not explicitly provided
        if (json.has("analyzer_info") && !json.get("analyzer_info").isJsonNull()) {
            sample.setAnalyzerInfo(json.get("analyzer_info").getAsString());
        } else {
            sample.setAnalyzerInfo(sample.getSampleId());
        }

        // Set timestamps if provided
        if (json.has("submit_datetime") && !json.get("submit_datetime").isJsonNull()) {
            sample.setSubmitDateTime(json.get("submit_datetime").getAsString());
        }
        if (json.has("print_datetime") && !json.get("print_datetime").isJsonNull()) {
            sample.setPrintDateTime(json.get("print_datetime").getAsString());
        }
        if (json.has("operator") && !json.get("operator").isJsonNull()) {
            sample.setOperator(json.get("operator").getAsString());
        }
        if (json.has("reviewer") && !json.get("reviewer").isJsonNull()) {
            sample.setReviewer(json.get("reviewer").getAsString());
        }

        JsonObject testResults = json.getAsJsonObject("test_results");
        for (String testCode : pcrCodes(testResults)) {
            PcrParameter param = new PcrParameter();
            param.setTestCode(PcrTestCode.fromCode(testCode));
            param.setName(testCode);
            param.setResult(testResults.get(testCode).getAsString());
            param.setReferentValues(getStr(testResults, testCode + "_range", PcrTestCode.getNegativeRange()));

            String curve = getStr(testResults, testCode + "_curve", null);
            if (curve != null) {
                param.parseCurveData(curve);
            }
            param.setSampleType(getStr(testResults, testCode + "_sample_type", null));
            param.setLotNumber(getStr(testResults, testCode + "_lot", null));
            param.setThreshold(ResultClassifier.parseNumber(getStr(testResults, testCode + "_threshold", null)));
            param.setDeviceFlag(getStr(testResults, testCode + "_flag", null));
            param.determineIndicator();

            sample.addPcrParameter(param);
        }

        return sample;
    }
}
