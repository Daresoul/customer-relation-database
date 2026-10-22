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

#[cfg(test)]
pub mod diagnosis_tests;

#[cfg(test)]
pub mod sql_schema_check;

#[cfg(test)]
pub mod household_search_index_tests;

#[cfg(test)]
pub mod owner_lookup_tests;

#[cfg(test)]
pub mod device_patient_match_tests;

#[cfg(test)]
pub mod table_rebuild_tests;

#[cfg(test)]
pub mod command_registration_tests;

#[cfg(test)]
pub mod device_health_tests;

#[cfg(test)]
pub mod device_delivery_tests;

#[cfg(test)]
pub mod folder_watch_tests;

#[cfg(test)]
pub mod google_sync_status_tests;

#[cfg(test)]
pub mod record_money_tests;

#[cfg(test)]
pub mod attachment_purge_tests;
