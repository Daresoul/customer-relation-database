use printpdf::*;
use std::fs::File;
use std::io::{BufWriter, Cursor};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde_json::Value;

// Color helper functions (RGB values 0-255 converted to 0-1)
fn cyan_color() -> Color {
    Color::Rgb(Rgb::new(127.0/255.0, 203.0/255.0, 196.0/255.0, None))  // #7fcbc4
}

fn cyan_dark_color() -> Color {
    Color::Rgb(Rgb::new(99.0/255.0, 193.0/255.0, 185.0/255.0, None))  // #63c1b9
}

fn light_gray_color() -> Color {
    Color::Rgb(Rgb::new(236.0/255.0, 239.0/255.0, 241.0/255.0, None))  // #eceff1
}

fn dark_gray_color() -> Color {
    Color::Rgb(Rgb::new(186.0/255.0, 189.0/255.0, 190.0/255.0, None))  // #babdbe
}

fn red_color() -> Color {
    Color::Rgb(Rgb::new(250.0/255.0, 128.0/255.0, 114.0/255.0, None))  // #fa8072
}

fn white_color() -> Color {
    Color::Rgb(Rgb::new(1.0, 1.0, 1.0, None))
}

fn black_color() -> Color {
    Color::Rgb(Rgb::new(0.0, 0.0, 0.0, None))
}

// Font sizes from specification (in points)
const CELL_FONT_SIZE: f32 = 10.0;
const HEADER_FONT_SIZE: f32 = 8.0;
const SMALL_FONT_SIZE: f32 = 8.0;
const TITLE_FONT_SIZE: f32 = 11.0;
const CLINIC_NAME_SIZE: f32 = 25.0;
const VET_CLINIC_SIZE: f32 = 15.0;
const CONTACT_SIZE: f32 = 11.0;

/// Exigo parameter with result, indicator, unit, and reference values
#[derive(Debug, Clone)]
pub struct ExigoParameter {
    pub code: String,
    pub name: String,
    pub result: String,
    pub indicator: String,  // "N" = normal, "H" = high, "L" = low
    pub unit: String,
    pub reference_values: String,
}

/// Complete Exigo sample data
#[derive(Debug, Clone)]
pub struct ExigoSampleData {
    pub sample_id: String,
    pub patient_id: String,
    pub analysis_datetime: DateTime<Utc>,
    pub parameters: Vec<ExigoParameter>,
}

/// Patient information
#[derive(Debug, Clone)]
pub struct PatientInfo {
    pub name: String,
    pub owner: String,
    pub species: String,
    pub microchip_id: Option<String>,
    pub gender: String,
    pub date_of_birth: Option<String>,
}

/// Translate gender from English to Macedonian
/// Matches Java Gender enum behavior
fn translate_gender(gender: &str) -> String {
    let gender_lower = gender.to_lowercase();
    if gender_lower.contains("male") || gender_lower == "m" || gender_lower == "м" {
        "мажјак".to_string()
    } else if gender_lower.contains("female") || gender_lower == "f" || gender_lower == "ж" {
        "женка".to_string()
    } else {
        "мажјак".to_string() // Default to male as per Java code
    }
}

/// Translate species from English to Macedonian
/// Matches Java PatientType enum behavior
fn translate_species(species: &str) -> String {
    let species_lower = species.to_lowercase();
    if species_lower.contains("dog") || species_lower.contains("куче") {
        "куче".to_string()
    } else if species_lower.contains("cat") || species_lower.contains("мачка") {
        "маче".to_string()
    } else {
        // Return as-is if not recognized
        species.to_string()
    }
}

/// Clinic information
#[derive(Debug, Clone)]
pub struct ClinicInfo {
    pub name: String,
    pub vet_clinic_label: String,
    pub address_line1: String,
    pub address_line2: String,
    pub mobile: String,
    pub email: String,
    pub website: String,
    pub contact_label: String,
}

impl Default for ClinicInfo {
    fn default() -> Self {
        Self {
            name: "Д-р Марин Величковски".to_string(),
            vet_clinic_label: "ВЕТЕРИНАРНА КЛИНИКА".to_string(),
            address_line1: "Васко Каранѓелески бр. 9".to_string(),
            address_line2: "Скопје, Македонија".to_string(),
            mobile: "мобилен: 070/340 846".to_string(),
            email: "info@doktormarin.com.mk".to_string(),
            website: "www.doktormarin.com.mk".to_string(),
            contact_label: "контакт".to_string(),
        }
    }
}

pub struct ExigoPdfGenerator {
    clinic_info: ClinicInfo,
}

impl ExigoPdfGenerator {
    pub fn new(clinic_info: ClinicInfo) -> Self {
        Self { clinic_info }
    }

    pub fn with_default_clinic() -> Self {
        Self::new(ClinicInfo::default())
    }

    /// Generate Exigo PDF report
    pub fn generate_report(
        &self,
        output_path: &str,
        patient: PatientInfo,
        sample_data: ExigoSampleData,
    ) -> Result<(), String> {
        // Create A4 document with ZERO margins (as per spec)
        let (doc, page1, layer1) = PdfDocument::new(
            "Резултати од лабораториски анализи",
            Mm(210.0), // A4 width
            Mm(297.0), // A4 height
            "Layer 1"
        );

        let current_layer = doc.get_page(page1).get_layer(layer1);

        // Load font with Cyrillic support
        let font = self.load_cyrillic_font(&doc)?;

        // A4 dimensions
        let page_width = Mm(210.0);
        let page_height = Mm(297.0);

        // Starting position from top
        let mut current_y = page_height - Mm(20.0);

        // 1. Add header with logo
        current_y = self.add_header(&doc, &current_layer, &font, current_y, page_width)?;

        // 2. Add title line
        current_y = self.add_title_line(&current_layer, &font, current_y, page_width)?;

        // 3. Add patient info
        current_y = self.add_patient_info(&current_layer, &font, current_y, page_width, &patient)?;

        // 4. Add Exigo results table
        current_y = self.add_exigo_results_table(&current_layer, &font, current_y, page_width, &sample_data)?;

        // 5. Add sample info
        current_y = self.add_sample_info(&current_layer, &font, current_y, page_width, &sample_data)?;

        // 6. Add footer at bottom
        self.add_footer(&current_layer, &font, Mm(30.0), page_width)?;

        // Save PDF
        doc.save(&mut BufWriter::new(File::create(output_path)
            .map_err(|e| format!("Failed to create PDF file: {}", e))?))
            .map_err(|e| format!("Failed to save PDF: {}", e))?;

        Ok(())
    }

    /// Load an image from the assets directory and convert to printpdf Image
    fn load_image(&self, filename: &str) -> Result<Image, String> {
        // Try to load from src-tauri/assets/images/ directory
        let asset_path = std::path::Path::new("assets/images").join(filename);

        let dynamic_img = ::image::open(&asset_path)
            .map_err(|e| format!("Failed to load image {}: {}", filename, e))?;

        // Convert to RGB8 format for printpdf
        let rgb_img = dynamic_img.to_rgb8();
        let (width, height) = rgb_img.dimensions();

        // Create ImageXObject from raw RGB data
        Ok(Image::from(ImageXObject {
            width: Px(width as usize),
            height: Px(height as usize),
            color_space: ColorSpace::Rgb,
            bits_per_component: ColorBits::Bit8,
            interpolate: true,
            image_data: rgb_img.into_raw(),
            image_filter: None,
            clipping_bbox: None,
            smask: None,
        }))
    }

    /// Load font with Cyrillic support
    fn load_cyrillic_font(&self, doc: &PdfDocumentReference) -> Result<IndirectFontRef, String> {
        // Try to load system font with Cyrillic support
        let font_data = if cfg!(target_os = "macos") {
            std::fs::read("/System/Library/Fonts/Supplemental/Arial.ttf")
                .or_else(|_| std::fs::read("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"))
        } else if cfg!(target_os = "windows") {
            std::fs::read("C:\\Windows\\Fonts\\arial.ttf")
        } else {
            std::fs::read("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf")
                .or_else(|_| std::fs::read("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        };

        let font_data = font_data.map_err(|e| {
            format!("Failed to load system font with Cyrillic support: {}. Please ensure Arial or Liberation Sans is installed.", e)
        })?;

        let mut cursor = Cursor::new(font_data);
        doc.add_external_font(&mut cursor)
            .map_err(|e| format!("Failed to add font to PDF: {}", e))
    }

    /// Add clinic header with logo
    fn add_header(
        &self,
        doc: &PdfDocumentReference,
        layer: &PdfLayerReference,
        font: &IndirectFontRef,
        start_y: Mm,
        page_width: Mm,
    ) -> Result<Mm, String> {
        let mut y = start_y;
        let left_margin = Mm(20.0);
        let right_margin = Mm(20.0);

        // Add logo on the right side
        // Logo dimensions from Java: 192x195 pixels scaled to appropriate PDF size
        let logo_width_mm = Mm(50.0);  // Scaled width
        let logo_height_mm = Mm(51.0); // Scaled height

        if let Ok(logo_image) = self.load_image("logo.png") {
            let logo_x = page_width - right_margin - logo_width_mm;
            let logo_y = start_y - logo_height_mm;

            // Add image to PDF
            logo_image.add_to_layer(
                layer.clone(),
                ImageTransform {
                    translate_x: Some(logo_x),
                    translate_y: Some(logo_y),
                    rotate: None,
                    scale_x: Some(logo_width_mm.0 / 300.0),  // Adjust scaling factor
                    scale_y: Some(logo_height_mm.0 / 300.0),
                    dpi: Some(300.0),
                },
            );
        }

        // Vet clinic label
        layer.use_text(&self.clinic_info.vet_clinic_label, VET_CLINIC_SIZE, left_margin, y, font);
        y -= Mm(8.0);

        // Clinic name
        layer.use_text(&self.clinic_info.name, CLINIC_NAME_SIZE, left_margin, y, font);
        y -= Mm(15.0);

        // Contact label (in cyan dark color)
        layer.set_fill_color(cyan_dark_color());
        layer.use_text(&self.clinic_info.contact_label, CONTACT_SIZE, left_margin, y, font);
        layer.set_fill_color(black_color());
        y -= Mm(6.0);

        // Contact details
        layer.use_text(&self.clinic_info.address_line1, CELL_FONT_SIZE, left_margin, y, font);
        y -= Mm(5.0);
        layer.use_text(&self.clinic_info.address_line2, CELL_FONT_SIZE, left_margin, y, font);
        y -= Mm(5.0);
        layer.use_text(&self.clinic_info.mobile, CELL_FONT_SIZE, left_margin, y, font);
        y -= Mm(5.0);
        layer.use_text(&self.clinic_info.email, CELL_FONT_SIZE, left_margin, y, font);
        y -= Mm(10.0);

        Ok(y)
    }

    /// Add title line with cyan separators
    fn add_title_line(
        &self,
        layer: &PdfLayerReference,
        font: &IndirectFontRef,
        start_y: Mm,
        page_width: Mm,
    ) -> Result<Mm, String> {
        let y = start_y;
        let left_margin = Mm(20.0);
        let right_margin = Mm(20.0);

        // Draw cyan line
        let line_y = y + Mm(2.0);
        layer.set_outline_color(cyan_color());
        layer.set_outline_thickness(1.0);

        let line = Line {
            points: vec![
                (Point::new(left_margin, line_y), false),
                (Point::new(page_width - right_margin, line_y), false),
            ],
            is_closed: false,
        };
        layer.add_line(line);

        // Title text centered
        let title = "РЕЗУЛТАТИ ОД ЛАБОРАТОРИСКИ АНАЛИЗИ";
        let text_width = self.estimate_text_width(title, TITLE_FONT_SIZE);
        let center_x = (page_width.0 - text_width) / 2.0;

        layer.set_fill_color(dark_gray_color());
        layer.use_text(title, TITLE_FONT_SIZE, Mm(center_x), y, font);
        layer.set_fill_color(black_color());

        Ok(y - Mm(10.0))
    }

    /// Add patient information
    fn add_patient_info(
        &self,
        layer: &PdfLayerReference,
        font: &IndirectFontRef,
        start_y: Mm,
        page_width: Mm,
        patient: &PatientInfo,
    ) -> Result<Mm, String> {
        let mut y = start_y;
        let left_margin = Mm(60.0); // Centered-ish
        let box_width = Mm(90.0);

        // Header with cyan background (single sample style)
        let header_y = y;
        layer.set_fill_color(cyan_color());
        layer.add_rect(Rect::new(left_margin, header_y - Mm(6.0), left_margin + box_width, header_y + Mm(2.0)));

        layer.set_fill_color(white_color());
        let header_x = left_margin + box_width - Mm(25.0);
        layer.use_text("ПАЦИЕНТ", HEADER_FONT_SIZE, header_x, header_y - Mm(2.0), font);
        y -= Mm(8.0);

        // Patient details with light gray borders
        layer.set_fill_color(dark_gray_color());

        // Translate species and gender to Macedonian (matching Java behavior)
        let species_translated = translate_species(&patient.species);
        let gender_translated = translate_gender(&patient.gender);

        let details = vec![
            format!("Име: {}", patient.name),
            format!("Сопственик: {}", patient.owner),
            format!("Вид: {}", species_translated),
        ];

        for detail in &details {
            layer.use_text(detail, CELL_FONT_SIZE, left_margin + Mm(2.0), y, font);
            y -= Mm(6.0);

            // Bottom border
            layer.set_outline_color(light_gray_color());
            let line = Line {
                points: vec![
                    (Point::new(left_margin, y + Mm(2.0)), false),
                    (Point::new(left_margin + box_width, y + Mm(2.0)), false),
                ],
                is_closed: false,
            };
            layer.add_line(line);
        }

        // Always show microchip field, use "8070500000" as default if not available (matching Java)
        let microchip_value = patient.microchip_id.as_deref().unwrap_or("8070500000");
        let detail = format!("Микрочип: {}", microchip_value);
        layer.use_text(&detail, CELL_FONT_SIZE, left_margin + Mm(2.0), y, font);
        y -= Mm(6.0);

        // Bottom border for microchip
        layer.set_outline_color(light_gray_color());
        let line = Line {
            points: vec![
                (Point::new(left_margin, y + Mm(2.0)), false),
                (Point::new(left_margin + box_width, y + Mm(2.0)), false),
            ],
            is_closed: false,
        };
        layer.add_line(line);

        let detail = format!("Пол: {}", gender_translated);
        layer.use_text(&detail, CELL_FONT_SIZE, left_margin + Mm(2.0), y, font);
        y -= Mm(6.0);

        // Do NOT show date of birth in patient box (matching Java behavior)
        // Java only shows: Name, Owner, Species, Microchip, Gender

        layer.set_fill_color(black_color());
        Ok(y - Mm(10.0))
    }

    /// Add Exigo results table with 5 columns and vertical title
    fn add_exigo_results_table(
        &self,
        layer: &PdfLayerReference,
        font: &IndirectFontRef,
        start_y: Mm,
        page_width: Mm,
        sample_data: &ExigoSampleData,
    ) -> Result<Mm, String> {
        let mut y = start_y;
        let left_margin = Mm(20.0);
        let table_width = page_width - Mm(40.0);

        // Column widths: [8, 33, 17, 17, 25] percentages
        let col1_width = table_width * 0.08;
        let col2_width = table_width * 0.33;
        let col3_width = table_width * 0.17;
        let col4_width = table_width * 0.17;
        let col5_width = table_width * 0.25;

        let col1_x = left_margin;
        let col2_x = col1_x + col1_width;
        let col3_x = col2_x + col2_width;
        let col4_x = col3_x + col3_width;
        let col5_x = col4_x + col4_width;

        // Header row with light gray background
        let header_height = Mm(6.0);
        layer.set_fill_color(light_gray_color());
        layer.add_rect(Rect::new(left_margin, y - header_height, left_margin + table_width, y));

        layer.set_fill_color(black_color());
        layer.use_text("ПАРАМЕТАР", HEADER_FONT_SIZE, col2_x + Mm(2.0), y - Mm(4.0), font);
        layer.use_text("РЕЗУЛТАТ", HEADER_FONT_SIZE, col3_x + Mm(2.0), y - Mm(4.0), font);
        layer.use_text("ЕДИНИЦА", HEADER_FONT_SIZE, col4_x + Mm(2.0), y - Mm(4.0), font);
        layer.use_text("РЕФЕРЕНТНИ", HEADER_FONT_SIZE, col5_x + Mm(2.0), y - Mm(4.0), font);
        layer.use_text("ВРЕДНОСТИ", HEADER_FONT_SIZE, col5_x + Mm(2.0), y - Mm(7.0), font);

        y -= header_height + Mm(2.0);

        // Vertical title "ХЕМАТОЛОГИЈА"
        let vertical_title = "ХЕМАТОЛОГИЈА";
        let vertical_chars: Vec<char> = vertical_title.chars().collect();

        // Parameter rows
        let row_height = Mm(6.0);
        for (idx, param) in sample_data.parameters.iter().enumerate() {
            // Vertical title character (rows 3-13, indices 3-13)
            if idx >= 3 && idx < 14 {
                let char_idx = idx - 3;
                if let Some(ch) = vertical_chars.get(char_idx) {
                    // Cyan background for character cell
                    layer.set_fill_color(cyan_color());
                    layer.add_rect(Rect::new(col1_x, y - row_height, col2_x, y));

                    // White text
                    layer.set_fill_color(white_color());
                    let char_str = ch.to_string();
                    let char_x = col1_x + Mm(col1_width.0 / 2.0) - Mm(1.0);
                    layer.use_text(&char_str, CELL_FONT_SIZE, char_x, y - Mm(4.0), font);
                }
            }

            // Parameter name
            layer.set_fill_color(dark_gray_color());
            layer.use_text(&param.name, CELL_FONT_SIZE, col2_x + Mm(2.0), y - Mm(4.0), font);

            // Result value with color coding
            let result_color = match param.indicator.as_str() {
                "N" => cyan_color(),
                "H" | "L" => red_color(),
                _ => dark_gray_color(),
            };
            layer.set_fill_color(result_color);
            layer.use_text(&param.result, CELL_FONT_SIZE, col3_x + Mm(2.0), y - Mm(4.0), font);

            // Unit
            layer.set_fill_color(dark_gray_color());
            layer.use_text(&param.unit, CELL_FONT_SIZE, col4_x + Mm(2.0), y - Mm(4.0), font);

            // Reference values
            layer.use_text(&param.reference_values, CELL_FONT_SIZE, col5_x + Mm(2.0), y - Mm(4.0), font);

            // Bottom border (light gray)
            layer.set_outline_color(light_gray_color());
            layer.set_outline_thickness(0.5);
            let line = Line {
                points: vec![
                    (Point::new(left_margin, y - row_height), false),
                    (Point::new(left_margin + table_width, y - row_height), false),
                ],
                is_closed: false,
            };
            layer.add_line(line);

            y -= row_height;
        }

        layer.set_fill_color(black_color());
        Ok(y - Mm(5.0))
    }

    /// Add sample info section
    fn add_sample_info(
        &self,
        layer: &PdfLayerReference,
        font: &IndirectFontRef,
        start_y: Mm,
        page_width: Mm,
        sample_data: &ExigoSampleData,
    ) -> Result<Mm, String> {
        let y = start_y;

        let sample_info = format!(
            "Примерок број: {} | Датум: {} | Пациент: {}",
            sample_data.sample_id,
            sample_data.analysis_datetime.format("%d/%m/%Y %H:%M"),
            sample_data.patient_id
        );

        // Centered italic text (we'll approximate italic by using smaller font)
        let text_width = self.estimate_text_width(&sample_info, SMALL_FONT_SIZE);
        let center_x = (page_width.0 - text_width) / 2.0;

        layer.set_fill_color(dark_gray_color());
        layer.use_text(&sample_info, SMALL_FONT_SIZE, Mm(center_x), y, font);

        // Cyan bottom border
        layer.set_outline_color(cyan_color());
        let line = Line {
            points: vec![
                (Point::new(Mm(20.0), y - Mm(2.0)), false),
                (Point::new(page_width - Mm(20.0), y - Mm(2.0)), false),
            ],
            is_closed: false,
        };
        layer.add_line(line);

        layer.set_fill_color(black_color());
        Ok(y - Mm(10.0))
    }

    /// Add footer with social media icons
    fn add_footer(
        &self,
        layer: &PdfLayerReference,
        font: &IndirectFontRef,
        y: Mm,
        page_width: Mm,
    ) -> Result<(), String> {
        let left_margin = Mm(20.0);
        let right_margin = Mm(20.0);

        // Cyan separator line
        layer.set_outline_color(cyan_color());
        let line = Line {
            points: vec![
                (Point::new(left_margin, y + Mm(2.0)), false),
                (Point::new(page_width - right_margin, y + Mm(2.0)), false),
            ],
            is_closed: false,
        };
        layer.add_line(line);

        // Website on the left
        layer.set_fill_color(dark_gray_color());
        layer.use_text(&self.clinic_info.website, CELL_FONT_SIZE, left_margin, y - Mm(2.0), font);
        layer.set_fill_color(black_color());

        // Add social media icons on the right
        if let Ok(socials_image) = self.load_image("socials.png") {
            // Social icons: scale to reasonable size (approx 80mm width to match Java)
            let socials_width_mm = Mm(80.0);
            let socials_height_mm = Mm(15.0);  // Approximate height

            let socials_x = page_width - right_margin - socials_width_mm;
            let socials_y = y - socials_height_mm - Mm(4.0);

            // Add image to PDF
            socials_image.add_to_layer(
                layer.clone(),
                ImageTransform {
                    translate_x: Some(socials_x),
                    translate_y: Some(socials_y),
                    rotate: None,
                    scale_x: Some(socials_width_mm.0 / 300.0),  // Adjust scaling factor
                    scale_y: Some(socials_height_mm.0 / 300.0),
                    dpi: Some(300.0),
                },
            );
        }

        Ok(())
    }

    /// Estimate text width (rough approximation)
    fn estimate_text_width(&self, text: &str, font_size: f32) -> f32 {
        text.chars().count() as f32 * font_size * 0.5
    }
}

/// Parse Exigo data from JSON and create ExigoSampleData
pub fn parse_exigo_sample_data(
    test_results: &Value,
    sample_id: &str,
    patient_id: &str,
    detected_at: DateTime<Utc>,
) -> Result<ExigoSampleData, String> {
    let results_map = test_results.as_object()
        .ok_or("Test results must be an object")?;

    // Extract parameters in the CORRECT order - matching Java version (print-app)
    let parameter_order = vec![
        ("PLT", "PLT - тромбоцити", "10e+9/L"),
        ("MPV", "MPV", "fL"),
        ("HGB", "HGB - хемоглобин", "g/dL"),
        ("WBC", "WBC - леукоцити", "10e+9/L"),
        ("LA", "LA - лимфоцити", "10e+9/L"),
        ("MA", "MA - моноцити", "10e+9/L"),
        ("GA", "NEUT - неутрофили", "10e+9/L"),
        ("LR", "LR - лимфоцити %", "%"),
        ("MR", "MR - моноцити %", "%"),
        ("GR", "GR - гранулоцити %", "%"),
        ("EA", "EA - еозинофили", "10e+9/L"),
        ("ER", "ER - еозинофили %", "%"),
        ("RBC", "RBC - еритроцити", "10e+12/L"),
        ("MCV", "MCV", "fL"),
        ("HCT", "HCT - хематокрит", "%"),
        ("MCH", "MCH", "pg"),
        ("MCHC", "MCHC", "g/dL"),
        ("RDWR", "RDW %", "%"),
        ("RDWA", "RDW", "fL"),
    ];

    let mut parameters = Vec::new();

    for (code, name, unit) in parameter_order {
        let result_value = results_map.get(code)
            .and_then(|v| v.as_str())
            .unwrap_or("N/A");

        let low_key = format!("{}_L", code);
        let high_key = format!("{}_H", code);

        let low_ref = results_map.get(&low_key).and_then(|v| v.as_str());
        let high_ref = results_map.get(&high_key).and_then(|v| v.as_str());

        let reference_values = match (low_ref, high_ref) {
            (Some(low), Some(high)) => format!("{} - {}", low, high),
            _ => "N/A".to_string(),
        };

        let indicator = determine_indicator(result_value, low_ref, high_ref);

        parameters.push(ExigoParameter {
            code: code.to_string(),
            name: name.to_string(),
            result: result_value.to_string(),
            indicator,
            unit: unit.to_string(),
            reference_values,
        });
    }

    Ok(ExigoSampleData {
        sample_id: sample_id.to_string(),
        patient_id: patient_id.to_string(),
        analysis_datetime: detected_at,
        parameters,
    })
}

/// Determine if result is Normal, High, or Low
fn determine_indicator(result: &str, low: Option<&str>, high: Option<&str>) -> String {
    if result == "N/A" {
        return "N".to_string();
    }

    let result_val = match result.parse::<f64>() {
        Ok(v) => v,
        Err(_) => return "N".to_string(),
    };

    if let Some(low_str) = low {
        if let Ok(low_val) = low_str.parse::<f64>() {
            if result_val < low_val {
                return "L".to_string();
            }
        }
    }

    if let Some(high_str) = high {
        if let Ok(high_val) = high_str.parse::<f64>() {
            if result_val > high_val {
                return "H".to_string();
            }
        }
    }

    "N".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_indicator_determination() {
        assert_eq!(determine_indicator("5.0", Some("4.0"), Some("6.0")), "N");
        assert_eq!(determine_indicator("3.0", Some("4.0"), Some("6.0")), "L");
        assert_eq!(determine_indicator("7.0", Some("4.0"), Some("6.0")), "H");
        assert_eq!(determine_indicator("N/A", Some("4.0"), Some("6.0")), "N");
    }
}
