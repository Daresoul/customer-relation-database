package com.vetclinic.pdf;

import com.google.gson.*;
import com.vetclinic.pdf.constants.*;
import com.vetclinic.pdf.constants.parameters.HealvetParameterEnum;
import com.vetclinic.pdf.models.Patient;
import com.vetclinic.pdf.models.parameters.HealvetParameter;
import com.vetclinic.pdf.models.parameters.Parameter;
import com.vetclinic.pdf.models.samples.*;
import com.vetclinic.pdf.services.PDFReportService;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

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
 *     "gender": "MALE",
 *     "date_of_birth": "2020-01-15"
 *   },
 *   "samples": [
 *     {
 *       "device_type": "exigo_eos_vet",
 *       "sample_id": "12345",
 *       "test_results": { "RBC": "5.2", "HGB": "14.5", ... },
 *       "detected_at": "2025-10-14T10:30:00Z",
 *       "patient_id": "123456"
 *     }
 *   ],
 *   "output_path": "/path/to/output.pdf"
 * }
 */
public class PdfGeneratorCLI {

    public static void main(String[] args) {
        if (args.length != 1) {
            System.err.println("Usage: pdf-generator <input.json>");
            System.exit(1);
        }

        try {
            String inputPath = args[0];
            String jsonContent = new String(Files.readAllBytes(Paths.get(inputPath)));

            Gson gson = new Gson();
            JsonObject json = gson.fromJson(jsonContent, JsonObject.class);

            // Parse patient
            Patient patient = parsePatient(json.getAsJsonObject("patient"));

            // Parse samples (pass patient type for Healvet reference ranges)
            List<Sample> samples = parseSamples(json.getAsJsonArray("samples"), patient.getPatientType());

            // Get output path
            String outputPath = json.get("output_path").getAsString();

            // Generate PDF using existing service
            PDFReportService service = PDFReportService.getInstance();
            File pdfFile = service.createPDFReport(patient, samples, outputPath);

            System.out.println("PDF generated successfully: " + outputPath);

        } catch (Exception e) {
            System.err.println("Error generating PDF: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static Patient parsePatient(JsonObject json) {
        Patient patient = new Patient();
        patient.setName(json.get("name").getAsString());
        patient.setOwner(json.get("owner").getAsString());

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

        // Map gender string to Gender enum
        String gender = json.get("gender").getAsString().toUpperCase();
        if (gender.contains("MALE") || gender.equals("М")) {
            patient.setGender(Gender.MALE);
        } else if (gender.contains("FEMALE") || gender.equals("Ж")) {
            patient.setGender(Gender.FEMALE);
        } else {
            patient.setGender(Gender.MALE); // Default to MALE
        }

        if (json.has("date_of_birth") && !json.get("date_of_birth").isJsonNull()) {
            String dobString = json.get("date_of_birth").getAsString();
            patient.setDateOfBirth(com.vetclinic.pdf.Util.parseDateStringRepresentation(dobString));
        }

        return patient;
    }

    private static List<Sample> parseSamples(JsonArray samplesJson, PatientType patientType) {
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
                case "mnchip_pointcare_pcr_v1":
                    sample = parsePointcareSample(sampleJson);
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
                samples.add(sample);
            }
        }

        return samples;
    }

    private static ExigoSample parseExigoSample(JsonObject json) {
        ExigoSample sample = new ExigoSample();
        sample.setSampleId(json.get("sample_id").getAsString());
        sample.setPatientId(json.get("patient_id").getAsString());
        sample.setAnalysisDateAndTime(json.get("detected_at").getAsString());

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

                // Determine indicator from reference ranges
                try {
                    double resultVal = Double.parseDouble(parameter.getResult());
                    if (!referenceValues.isEmpty() && testResults.has(refLowKey) && testResults.has(refHighKey)) {
                        double refLow = Double.parseDouble(testResults.get(refLowKey).getAsString());
                        double refHigh = Double.parseDouble(testResults.get(refHighKey).getAsString());

                        if (resultVal < refLow) {
                            parameter.setIndicator(Indicator.LOW);
                        } else if (resultVal > refHigh) {
                            parameter.setIndicator(Indicator.HIGH);
                        } else {
                            parameter.setIndicator(Indicator.NORMAL);
                        }
                    } else {
                        parameter.setIndicator(Indicator.NORMAL);
                    }
                } catch (NumberFormatException e) {
                    parameter.setIndicator(Indicator.NORMAL);
                }

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
        sample.setAnalysisDateAndTime(json.get("detected_at").getAsString());

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

        // Pointcare parameter definitions with units and reference ranges (dog defaults)
        // Format: {code, translated_name, unit, ref_low, ref_high}
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
            {"Mg", "Mg - магнезиум", "mg/dL", "1.6", "2.4"}
        };

        // Process parameters in order they appear in the definition
        for (String[] paramDef : pointcareParams) {
            String code = paramDef[0];
            if (testResults.has(code)) {
                Parameter parameter = new Parameter();
                parameter.setName(paramDef[1]); // Translated name
                parameter.setResult(testResults.get(code).getAsString());
                parameter.setUnit(paramDef[2]); // Unit

                // Set reference values
                String refLow = paramDef[3];
                String refHigh = paramDef[4];
                if (!refLow.isEmpty() && !refHigh.isEmpty()) {
                    parameter.setReferentValues(refLow + " - " + refHigh);

                    // Determine indicator from reference ranges
                    try {
                        double resultVal = Double.parseDouble(parameter.getResult());
                        double low = Double.parseDouble(refLow);
                        double high = Double.parseDouble(refHigh);

                        if (resultVal < low) {
                            parameter.setIndicator(Indicator.LOW);
                        } else if (resultVal > high) {
                            parameter.setIndicator(Indicator.HIGH);
                        } else {
                            parameter.setIndicator(Indicator.NORMAL);
                        }
                    } catch (NumberFormatException e) {
                        parameter.setIndicator(Indicator.NORMAL);
                    }
                } else {
                    parameter.setReferentValues("");
                    parameter.setIndicator(Indicator.NORMAL);
                }

                parameters.add(parameter);
            }
        }

        sample.setParameters(parameters);
        return sample;
    }

    private static HealvetSample parseHealvetSample(JsonObject json, PatientType patientType) {
        HealvetSample sample = new HealvetSample();
        sample.setSampleId(json.get("sample_id").getAsString());
        sample.setPatientId(json.get("patient_id").getAsString());
        sample.setAnalysisDateAndTime(json.get("detected_at").getAsString());

        // Parse test results - Healvet stores each parameter as a key-value pair
        // where key is the parameter code (e.g., "TSH-1", "T4-1", "cCRP") and value is result
        JsonObject testResults = json.getAsJsonObject("test_results");
        List<Parameter> parameters = new ArrayList<>();

        // Process each parameter code in the test results
        for (String paramCode : testResults.keySet()) {
            // Skip metadata fields that may be present
            if (paramCode.equals("sample_id") || paramCode.equals("patient_id") ||
                paramCode.equals("datetime") || paramCode.equals("gender") ||
                paramCode.equals("sample_type")) {
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
                parameter.setIndicator(Indicator.NORMAL);
                parameters.add(parameter);
            }
        }

        sample.setParameters(parameters);
        return sample;
    }
}
