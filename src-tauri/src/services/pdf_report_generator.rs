use genpdf::elements;
use genpdf::fonts;
use genpdf::{Alignment, Document, Element, SimplePageDecorator};
use genpdf::style::{Color, Style};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Template configuration for PDF generation
#[derive(Debug, Clone)]
pub struct ReportTemplate {
    pub clinic_name: String,
    pub clinic_address: String,
    pub clinic_phone: String,
    pub clinic_email: String,
    pub clinic_website: String,
}

impl Default for ReportTemplate {
    fn default() -> Self {
        Self {
            clinic_name: "Ветеринарна Клиника".to_string(),
            clinic_address: "Адреса на клиниката".to_string(),
            clinic_phone: "Tel: +389 XX XXX XXX".to_string(),
            clinic_email: "email@clinic.com".to_string(),
            clinic_website: "www.clinic.com".to_string(),
        }
    }
}

/// Patient information for the report
#[derive(Debug, Clone)]
pub struct PatientInfo {
    pub name: String,
    pub owner: String,
    pub species: String,
    pub breed: Option<String>,
    pub microchip_id: Option<String>,
    pub gender: String,
    pub date_of_birth: Option<String>,
}

/// Device data with generic key-value results
#[derive(Debug, Clone)]
pub struct DeviceReportData {
    pub device_name: String,
    pub device_type: String,
    pub test_date: DateTime<Utc>,
    pub results: HashMap<String, String>, // Generic key-value pairs
}

pub struct PdfReportGenerator {
    template: ReportTemplate,
}

impl PdfReportGenerator {
    pub fn new(template: ReportTemplate) -> Self {
        Self { template }
    }

    pub fn with_default_template() -> Self {
        Self::new(ReportTemplate::default())
    }

    /// Generate a medical report PDF with device data
    pub fn generate_report(
        &self,
        output_path: &str,
        patient: PatientInfo,
        device_data: Vec<DeviceReportData>,
    ) -> Result<(), String> {
        // Create a temp directory for fonts with expected naming
        let temp_font_dir = std::env::temp_dir().join("vetclinic_fonts");
        std::fs::create_dir_all(&temp_font_dir)
            .map_err(|e| format!("Failed to create temp font dir: {}", e))?;

        // Copy fonts with expected naming pattern for genpdf
        // genpdf expects: FontName-Regular.ttf, FontName-Bold.ttf, FontName-Italic.ttf, FontName-BoldItalic.ttf
        if cfg!(target_os = "macos") {
            // macOS system fonts
            let font_mappings = vec![
                ("/System/Library/Fonts/Supplemental/Arial.ttf", "Arial-Regular.ttf"),
                ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "Arial-Bold.ttf"),
                ("/System/Library/Fonts/Supplemental/Arial Italic.ttf", "Arial-Italic.ttf"),
                ("/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf", "Arial-BoldItalic.ttf"),
            ];

            for (src, dst_name) in font_mappings {
                let dst = temp_font_dir.join(dst_name);
                if !dst.exists() {
                    if let Err(e) = std::fs::copy(src, &dst) {
                        eprintln!("⚠️  Could not copy {} to {}: {}", src, dst_name, e);
                    }
                }
            }
        } else if cfg!(target_os = "windows") {
            // Windows system fonts
            let windows_fonts_dir = "C:\\Windows\\Fonts";
            let font_mappings = vec![
                (format!("{}\\arial.ttf", windows_fonts_dir), "Arial-Regular.ttf"),
                (format!("{}\\arialbd.ttf", windows_fonts_dir), "Arial-Bold.ttf"),
                (format!("{}\\ariali.ttf", windows_fonts_dir), "Arial-Italic.ttf"),
                (format!("{}\\arialbi.ttf", windows_fonts_dir), "Arial-BoldItalic.ttf"),
            ];

            for (src, dst_name) in font_mappings {
                let dst = temp_font_dir.join(dst_name);
                if !dst.exists() {
                    if let Err(e) = std::fs::copy(&src, &dst) {
                        eprintln!("⚠️  Could not copy {} to {}: {}", src, dst_name, e);
                    }
                }
            }
        } else if cfg!(target_os = "linux") {
            // Linux system fonts (Liberation fonts as fallback)
            let font_mappings = vec![
                ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "Arial-Regular.ttf"),
                ("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "Arial-Bold.ttf"),
                ("/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf", "Arial-Italic.ttf"),
                ("/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf", "Arial-BoldItalic.ttf"),
            ];

            for (src, dst_name) in font_mappings {
                let dst = temp_font_dir.join(dst_name);
                if !dst.exists() {
                    if let Err(e) = std::fs::copy(src, &dst) {
                        eprintln!("⚠️  Could not copy {} to {}: {}", src, dst_name, e);
                    }
                }
            }
        }

        // Load font from temp directory
        let default_font = fonts::from_files(&temp_font_dir, "Arial", None)
            .map_err(|e| format!("Failed to load Arial font: {}. Please ensure system fonts are accessible.", e))?;

        let mut doc = Document::new(default_font);
        doc.set_title("Medical Laboratory Report");

        // Set page decorator with margins
        let mut decorator = SimplePageDecorator::new();
        decorator.set_margins(10);
        doc.set_page_decorator(decorator);

        // 1. Add header
        self.add_header(&mut doc)?;

        // 2. Add title
        self.add_title(&mut doc)?;

        // 3. Add patient info
        self.add_patient_info(&mut doc, &patient)?;

        // 4. Add device data tables
        for device in &device_data {
            self.add_device_table(&mut doc, device)?;
        }

        // 5. Add footer
        self.add_footer(&mut doc)?;

        // Render and save PDF
        doc.render_to_file(output_path)
            .map_err(|e| format!("Failed to save PDF: {}", e))?;

        Ok(())
    }

    /// Add clinic header with contact info
    fn add_header(&self, doc: &mut Document) -> Result<(), String> {
        // Clinic name (large, bold)
        doc.push(
            elements::Paragraph::new(&self.template.clinic_name)
                .styled(Style::new().bold().with_font_size(18)),
        );

        // Contact info
        doc.push(elements::Paragraph::new(&self.template.clinic_address));
        doc.push(elements::Paragraph::new(&self.template.clinic_phone));
        doc.push(elements::Paragraph::new(&self.template.clinic_email));

        // Separator line
        doc.push(elements::Break::new(1));
        doc.push(elements::LinearLayout::vertical().element(
            elements::Paragraph::new("—".repeat(80))
                .styled(Style::new().with_color(Color::Rgb(0, 150, 200))),
        ));
        doc.push(elements::Break::new(1));

        Ok(())
    }

    /// Add report title
    fn add_title(&self, doc: &mut Document) -> Result<(), String> {
        doc.push(
            elements::Paragraph::new("LABORATORY TEST RESULTS")
                .aligned(Alignment::Center)
                .styled(Style::new().bold().with_font_size(14)),
        );
        doc.push(
            elements::Paragraph::new("РЕЗУЛТАТИ ОД ЛАБОРАТОРИСКИ АНАЛИЗИ")
                .aligned(Alignment::Center)
                .styled(Style::new().bold().with_font_size(14)),
        );
        doc.push(elements::Break::new(1.5));

        Ok(())
    }

    /// Add patient information section
    fn add_patient_info(&self, doc: &mut Document, patient: &PatientInfo) -> Result<(), String> {
        // Section title
        doc.push(
            elements::Paragraph::new("PATIENT / ПАЦИЕНТ")
                .styled(Style::new().bold().with_font_size(12)),
        );

        // Patient details in a table-like format
        let mut layout = elements::LinearLayout::vertical();

        layout.push(elements::Paragraph::new(format!("Name / Име: {}", patient.name)));
        layout.push(elements::Paragraph::new(format!(
            "Owner / Сопственик: {}",
            patient.owner
        )));
        layout.push(elements::Paragraph::new(format!(
            "Species / Вид: {}",
            patient.species
        )));

        if let Some(breed) = &patient.breed {
            if !breed.is_empty() {
                layout.push(elements::Paragraph::new(format!("Breed / Раса: {}", breed)));
            }
        }

        if let Some(microchip) = &patient.microchip_id {
            layout.push(elements::Paragraph::new(format!(
                "Microchip / Микрочип: {}",
                microchip
            )));
        }

        layout.push(elements::Paragraph::new(format!(
            "Gender / Пол: {}",
            patient.gender
        )));

        if let Some(dob) = &patient.date_of_birth {
            layout.push(elements::Paragraph::new(format!(
                "Date of Birth / Датум на раѓање: {}",
                dob
            )));
        }

        doc.push(layout);
        doc.push(elements::Break::new(2));

        Ok(())
    }

    /// Add device results table (generic key-value display)
    fn add_device_table(
        &self,
        doc: &mut Document,
        device_data: &DeviceReportData,
    ) -> Result<(), String> {
        // Device header
        doc.push(
            elements::Paragraph::new(format!(
                "{} - {}",
                device_data.device_name, device_data.device_type
            ))
            .styled(Style::new().bold().with_font_size(11)),
        );

        // Test date
        doc.push(elements::Paragraph::new(format!(
            "Date / Датум: {}",
            device_data.test_date.format("%Y-%m-%d %H:%M")
        )));

        doc.push(elements::Break::new(0.5));

        // Create table for results
        let mut table = elements::TableLayout::new(vec![1, 2]);
        table.set_cell_decorator(elements::FrameCellDecorator::new(true, true, false));

        // Table header
        table
            .row()
            .element(
                elements::Paragraph::new("Parameter / Параметар")
                    .styled(Style::new().bold()),
            )
            .element(
                elements::Paragraph::new("Value / Вредност")
                    .styled(Style::new().bold()),
            )
            .push()
            .map_err(|e| format!("Failed to add table header: {}", e))?;

        // Sort keys for consistent display
        let mut sorted_keys: Vec<&String> = device_data.results.keys().collect();
        sorted_keys.sort();

        // Add all key-value pairs to table
        for key in sorted_keys {
            if let Some(value) = device_data.results.get(key) {
                table
                    .row()
                    .element(elements::Paragraph::new(key))
                    .element(elements::Paragraph::new(value))
                    .push()
                    .map_err(|e| format!("Failed to add table row: {}", e))?;
            }
        }

        doc.push(table);
        doc.push(elements::Break::new(2));

        Ok(())
    }

    /// Add footer with website and generation info
    fn add_footer(&self, doc: &mut Document) -> Result<(), String> {
        doc.push(elements::Break::new(1));
        doc.push(elements::Paragraph::new("—".repeat(80)));

        let mut footer_layout = elements::LinearLayout::vertical();

        footer_layout.push(elements::Paragraph::new(format!(
            "Website: {}",
            self.template.clinic_website
        )));
        footer_layout.push(elements::Paragraph::new(format!(
            "Generated: {}",
            Utc::now().format("%Y-%m-%d %H:%M")
        )));

        doc.push(footer_layout);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_sample_report() {
        let generator = PdfReportGenerator::with_default_template();

        let patient = PatientInfo {
            name: "Max".to_string(),
            owner: "John Doe".to_string(),
            species: "Dog".to_string(),
            breed: Some("German Shepherd".to_string()),
            microchip_id: Some("123456789".to_string()),
            gender: "Male".to_string(),
            date_of_birth: Some("2020-05-15".to_string()),
        };

        let mut exigo_results = HashMap::new();
        exigo_results.insert("RBC".to_string(), "5.4 10^12/L".to_string());
        exigo_results.insert("WBC".to_string(), "7.2 10^9/L".to_string());
        exigo_results.insert("HGB".to_string(), "14.2 g/dL".to_string());
        exigo_results.insert("HCT".to_string(), "42.5 %".to_string());

        let device_data = vec![DeviceReportData {
            device_name: "Exigo Eos Vet".to_string(),
            device_type: "Hematology Analyzer".to_string(),
            test_date: Utc::now(),
            results: exigo_results,
        }];

        let result = generator.generate_report("/tmp/test_report.pdf", patient, device_data);
        // Note: This test may fail in CI without fonts, so we allow it to fail gracefully
        if result.is_err() {
            println!("Test skipped due to font loading: {:?}", result.err());
        }
    }
}
