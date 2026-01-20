//! SeaORM Entity definitions
//!
//! This module contains all database entity definitions using SeaORM.
//! Entities map directly to database tables and define relationships.

pub mod app_settings;
pub mod appointment;
pub mod breed;
pub mod calendar_event_mapping;
pub mod currency;
pub mod device_integration;
pub mod file_access_history;
pub mod google_calendar_settings;
pub mod household;
pub mod medical_attachment;
pub mod medical_record;
pub mod medical_record_history;
pub mod patient;
pub mod person;
pub mod person_contact;
pub mod record_template;
pub mod room;
pub mod species;
pub mod sync_log;
pub mod update_preferences;

// Re-export entities for convenient access
