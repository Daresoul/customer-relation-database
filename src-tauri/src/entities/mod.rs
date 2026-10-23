//! SeaORM Entity definitions
//!
//! This module contains all database entity definitions using SeaORM.
//! Entities map directly to database tables and define relationships.

pub mod app_settings;
pub mod appointment;
pub mod breed;
pub mod currency;
pub mod device_integration;
pub mod file_access_history;
pub mod household;
pub mod line_item_template;
pub mod medical_attachment;
pub mod medical_record;
pub mod medical_record_history;
pub mod medical_record_line_item;
pub mod patient;
pub mod person;
pub mod person_contact;
pub mod record_template;
pub mod room;
pub mod species;
pub mod sync_log;

// Re-export entities for convenient access
