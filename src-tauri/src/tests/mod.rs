//! Test modules for the backend
//!
//! Contains:
//! - contract_tests: Frontend-backend boundary tests (JSON parsing)
//! - e2e_contract_tests: Full flow tests (JSON → validation → DB)
//! - device_parser_tests: Device data parsing (XML, HL7, serial)
//! - household_tests: Nested household/person/contact DTOs
//! - medical_record_tests: Medical record and template DTOs

#[cfg(test)]
pub mod contract_tests;

#[cfg(test)]
pub mod e2e_contract_tests;

#[cfg(test)]
pub mod device_parser_tests;

#[cfg(test)]
pub mod household_tests;

#[cfg(test)]
pub mod medical_record_tests;
