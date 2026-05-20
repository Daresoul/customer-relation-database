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

#[cfg(test)]
pub mod patient_tests;

#[cfg(test)]
pub mod backup_tests;

#[cfg(test)]
pub mod medical_record_service_tests;

#[cfg(test)]
pub mod household_service_tests;

#[cfg(test)]
pub mod species_breed_currency_tests;

#[cfg(test)]
pub mod migration_tests;

#[cfg(test)]
pub mod device_integration_tests;

#[cfg(test)]
pub mod settings_tests;

#[cfg(test)]
pub mod line_item_tests;

#[cfg(test)]
pub mod pending_file_history_tests;

#[cfg(test)]
pub mod file_storage_tests;
