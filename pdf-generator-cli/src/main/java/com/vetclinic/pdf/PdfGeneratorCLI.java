package com.vetclinic.pdf;

import com.google.gson.*;
import com.vetclinic.pdf.constants.*;
import com.vetclinic.pdf.models.Patient;
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

            // Parse samples
            List<Sample> samples = parseSamples(json.getAsJsonArray("samples"));

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

    private static List<Sample> parseSamples(JsonArray samplesJson) {
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
                case "healvet":
                    sample = parseHealvetSample(sampleJson);
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

        // Set test type
        if (json.has("test_type")) {
            String testType = json.get("test_type").getAsString();
            sample.setTestType(PointcareTestType.valueOf(testType));
        } else {
            sample.setTestType(PointcareTestType.HEALTH_CHECKING_PROFILE);
        }

        // Parse parameters
        JsonObject testResults = json.getAsJsonObject("test_results");
        List<Parameter> parameters = new ArrayList<>();

        for (String key : testResults.keySet()) {
            Parameter parameter = new Parameter();
            parameter.setName(key);
            parameter.setResult(testResults.get(key).getAsString());
            parameter.setIndicator(Indicator.NORMAL);
            parameters.add(parameter);
        }

        sample.setParameters(parameters);
        return sample;
    }

    private static HealvetSample parseHealvetSample(JsonObject json) {
        HealvetSample sample = new HealvetSample();
        sample.setSampleId(json.get("sample_id").getAsString());
        sample.setPatientId(json.get("patient_id").getAsString());
        sample.setAnalysisDateAndTime(json.get("detected_at").getAsString());

        // Parse parameters
        JsonObject testResults = json.getAsJsonObject("test_results");
        List<Parameter> parameters = new ArrayList<>();

        for (String key : testResults.keySet()) {
            Parameter parameter = new Parameter();
            parameter.setName(key);
            parameter.setResult(testResults.get(key).getAsString());
            parameter.setIndicator(Indicator.NORMAL);
            parameters.add(parameter);
        }

        sample.setParameters(parameters);
        return sample;
    }
}
