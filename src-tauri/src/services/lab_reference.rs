//! Names, units and reference ranges the lab PDF uses when a machine sends
//! none (`PdfGeneratorCLI.java`, `HealvetParameterEnum.java`). The Labs tab
//! and the stored lab values read them from here. A change to a range in the
//! Java tables must be made here too.

/// The species the Healvet ranges are written for. Like the PDF, anything
/// that isn't recognisably a cat counts as a dog.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Species {
    Dog,
    Cat,
}

impl Species {
    /// Same reading of the species name as `PdfGeneratorCLI.parsePatient`.
    pub fn from_name(name: Option<&str>) -> Species {
        let name = name.unwrap_or_default().to_lowercase();
        if name.contains("dog") || name.contains("куче") {
            Species::Dog
        } else if name.contains("cat") || name.contains("мачка") {
            Species::Cat
        } else {
            Species::Dog
        }
    }
}

/// What the PDF prints for an analyte when the machine leaves it out.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Reference {
    pub code: &'static str,
    pub name: &'static str,
    pub unit: Option<&'static str>,
    pub low: Option<f64>,
    pub high: Option<f64>,
}

const fn r(code: &'static str, name: &'static str, unit: &'static str, low: f64, high: f64) -> Reference {
    Reference { code, name, unit: Some(unit), low: Some(low), high: Some(high) }
}

const fn named(code: &'static str, name: &'static str, unit: Option<&'static str>) -> Reference {
    Reference { code, name, unit, low: None, high: None }
}

/// Exigo hematology, in the PDF's order. The machine sends each range.
pub const EXIGO: [Reference; 19] = [
    named("PLT", "PLT - тромбоцити", Some("10e+9/L")),
    named("MPV", "MPV", Some("fL")),
    named("HGB", "HGB - хемоглобин", Some("g/dL")),
    named("WBC", "WBC - леукоцити", Some("10e+9/L")),
    named("LA", "LA - лимфоцити", Some("10e+9/L")),
    named("MA", "MA - моноцити", Some("10e+9/L")),
    named("GA", "NEUT - неутрофили", Some("10e+9/L")),
    named("LR", "LR - лимфоцити %", Some("%")),
    named("MR", "MR - моноцити %", Some("%")),
    named("GR", "GR - гранулоцити %", Some("%")),
    named("EA", "EA - еозинофили", Some("10e+9/L")),
    named("ER", "ER - еозинофили %", Some("%")),
    named("RBC", "RBC - еритроцити", Some("10e+12/L")),
    named("MCV", "MCV", Some("fL")),
    named("HCT", "HCT - хематокрит", Some("%")),
    named("MCH", "MCH", Some("pg")),
    named("MCHC", "MCHC", Some("g/dL")),
    named("RDWR", "RDW %", Some("%")),
    named("RDWA", "RDW", Some("fL")),
];

/// PointCare chemistry, in the PDF's order, with the fallback unit and range
/// used when the machine sends none.
pub const POINTCARE: [Reference; 30] = [
    r("GLU", "GLU - гликоза", "mg/dL", 70.0, 110.0),
    r("BUN", "BUN - уреа", "mg/dL", 7.0, 27.0),
    r("CRE", "CRE - креатинин", "mg/dL", 0.5, 1.8),
    r("ALB", "ALB - албумин", "g/dL", 2.3, 4.0),
    r("TP", "TP - вк.протеини", "g/dL", 5.2, 8.2),
    r("Ca", "Ca - калциум", "mg/dL", 9.0, 11.3),
    r("P", "P - фосфор", "mg/dL", 2.5, 6.8),
    r("ALT", "ALT", "U/L", 10.0, 100.0),
    r("ALP", "ALP", "U/L", 23.0, 212.0),
    r("TBIL", "TBIL - т.билирубин", "mg/dL", 0.0, 0.9),
    r("CHOL", "CHOL - холестерол", "mg/dL", 110.0, 320.0),
    r("AMY", "AMY - амилаза", "U/L", 500.0, 1500.0),
    r("K+", "K+ калиум", "mmol/L", 3.5, 5.8),
    r("Na+", "Na+ натриум", "mmol/L", 144.0, 160.0),
    r("Cl-", "Cl- хлор", "mmol/L", 109.0, 122.0),
    r("GLO", "GLO - глобулин", "g/dL", 2.5, 4.5),
    r("CK", "CK - креатин киназа", "U/L", 10.0, 200.0),
    named("BUN/CRE", "BUN/CRE", None),
    named("A/G", "A/G", None),
    r("AST", "AST", "U/L", 10.0, 50.0),
    r("GGT", "GGT", "U/L", 0.0, 14.0),
    r("DBIL", "DBIL - дир.билирубин", "mg/dL", 0.0, 0.3),
    r("IBIL", "IBIL - индир.билирубин", "mg/dL", 0.0, 0.6),
    named("Na+/K+", "Na+/K+", None),
    r("CO2", "CO2 - јаг.диоксид", "mmol/L", 17.0, 24.0),
    r("Mg", "Mg - магнезиум", "mg/dL", 1.6, 2.4),
    named("TG", "TG - триглицериди", Some("mg/dL")),
    named("TBA", "TBA - жолчни киселини", None),
    named("AST/ALT", "AST/ALT", None),
    named("Ca*P", "Ca*P", None),
];

/// PointCare spellings the PDF reads as another code.
const POINTCARE_ALIASES: [(&str, &str); 7] = [
    ("GLOB", "GLO"),
    ("TRIG", "TG"),
    ("Na", "Na+"),
    ("K", "K+"),
    ("Cl", "Cl-"),
    ("tCO2", "CO2"),
    ("TCO2", "CO2"),
];

/// Healvet immunoassays per species. The machine sends no ranges. For
/// cortisol the PDF uses the before-ACTH normal range.
const HEALVET: [(Species, Reference); 22] = [
    (Species::Dog, r("vNT-proBNP-1", "proBNP", "pg/mL", 0.0, 8436.0)),
    (Species::Dog, r("vNT-proBNP-2", "proBNP", "pmol/L", 0.0, 800.0)),
    (Species::Cat, r("vNT-proBNP-1", "proBNP", "pg/mL", 0.0, 8436.0)),
    (Species::Cat, r("vNT-proBNP-2", "proBNP", "pmol/L", 0.0, 800.0)),
    (Species::Dog, r("TSH-1", "TSH хормон", "mIU/L", 0.0, 37.0)),
    (Species::Cat, r("TSH-1", "TSH хормон", "mIU/L", 0.0, 21.0)),
    (Species::Dog, r("TSH-2", "TSH хормон", "ng/mL", 0.017, 0.591)),
    (Species::Cat, r("TSH-2", "TSH хормон", "ng/mL", 0.03, 0.15)),
    (Species::Dog, r("T4-1", "T4 хормон", "nmol/L", 15.0, 60.0)),
    (Species::Cat, r("T4-1", "T4 хормон", "nmol/L", 15.0, 50.0)),
    (Species::Dog, r("T4-2", "T4 хормон", "µg/dL", 1.2, 4.7)),
    (Species::Cat, r("T4-2", "T4 хормон", "µg/dL", 1.2, 3.9)),
    (Species::Dog, r("D-Dimer", "D-Dimer", "ng/mL", 0.0, 250.0)),
    (Species::Cat, r("D-Dimer", "D-Dimer", "ng/mL", 0.0, 250.0)),
    (Species::Dog, r("Cortisol-1", "Кортизол", "nmol/L", 20.0, 110.0)),
    (Species::Cat, r("Cortisol-1", "Кортизол", "nmol/L", 20.0, 110.0)),
    (Species::Dog, r("Cortisol-2", "Кортизол", "µg/dL", 0.72, 3.99)),
    (Species::Cat, r("Cortisol-2", "Кортизол", "µg/dL", 0.72, 3.99)),
    (Species::Dog, r("cCRP", "CRP инфек. маркер", "mg/L", 0.0, 10.0)),
    (Species::Cat, r("cCRP", "CRP инфек. маркер", "mg/L", 0.0, 10.0)),
    (Species::Cat, r("SAA", "SAA инфек. маркер", "mg/L", 0.0, 8.0)),
    (Species::Dog, r("SAA", "SAA инфек. маркер", "mg/L", 0.0, 5.4)),
];

pub fn exigo(code: &str) -> Option<(usize, &'static Reference)> {
    EXIGO.iter().enumerate().find(|(_, r)| r.code == code)
}

/// The PDF's code for a PointCare analyte (its aliases mapped).
pub fn pointcare_code(code: &str) -> &str {
    POINTCARE_ALIASES.iter().find(|(alias, _)| *alias == code).map(|(_, c)| *c).unwrap_or(code)
}

pub fn pointcare(code: &str) -> Option<(usize, &'static Reference)> {
    let code = pointcare_code(code);
    POINTCARE.iter().enumerate().find(|(_, r)| r.code == code)
}

/// Matched without regard to case, as the PDF does.
pub fn healvet(code: &str, species: Species) -> Option<(usize, &'static Reference)> {
    HEALVET
        .iter()
        .enumerate()
        .find(|(_, (s, r))| *s == species && r.code.eq_ignore_ascii_case(code))
        .map(|(i, (_, r))| (i, r))
}
