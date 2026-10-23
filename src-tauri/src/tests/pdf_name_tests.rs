// A clinic working in Macedonian gets its PDFs named in Macedonian, with the
// same words the app shows for each document.
use crate::services::device_health::Lang;
use crate::services::medical_record::{MedicalRecordService, PdfKind};

#[test]
fn pdf_names_are_in_the_app_language() {
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::Report, Lang::Mk), "Медицински извештај");
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::PharmacyNote, Lang::Mk), "Рецепт за аптека");
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::Invoice, Lang::Mk), "Фактура");
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::DeviceReport, Lang::Mk), "Лабораториски извештај");
}

#[test]
fn english_names_stay_as_before() {
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::Report, Lang::En), "Medical Report");
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::PharmacyNote, Lang::En), "Pharmacy Note");
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::Invoice, Lang::En), "Invoice");
    assert_eq!(MedicalRecordService::pdf_kind_name(PdfKind::DeviceReport, Lang::En), "Device Report");
}
