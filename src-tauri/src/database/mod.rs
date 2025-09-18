pub mod config;
pub mod connection;
pub mod migrations;
pub mod queries;

// Re-export commonly used items
pub use config::{get_database_path, get_database_url};
pub use connection::{create_pool, DatabasePool};
pub use migrations::run_migrations;