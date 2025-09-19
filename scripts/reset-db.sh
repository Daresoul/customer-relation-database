#!/bin/bash

# Database reset script for the Veterinary Clinic Manager
# This script directly manipulates the SQLite database file

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database path (macOS)
DB_PATH="$HOME/Library/Application Support/com.vetclinic.app/vet_clinic.db"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${YELLOW}Database not found at: $DB_PATH${NC}"
    echo "The database will be created when you run the application."
    exit 0
fi

# Function to show usage
show_help() {
    echo "Database Management Tool"
    echo ""
    echo "Usage:"
    echo "  $0 [options]"
    echo ""
    echo "Options:"
    echo "  --reset, -r    Full reset - drops all tables and recreates (default)"
    echo "  --wipe, -w     Wipe data only - deletes all records but keeps schema"
    echo "  --backup, -b   Create a backup before resetting"
    echo "  --help, -h     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Full reset"
    echo "  $0 --wipe       # Keep schema, delete data only"
    echo "  $0 --backup     # Create backup then reset"
}

# Function to create backup
create_backup() {
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_PATH="${DB_PATH}.backup_${TIMESTAMP}"
    echo -e "${GREEN}Creating backup at: $BACKUP_PATH${NC}"
    cp "$DB_PATH" "$BACKUP_PATH"
    echo -e "${GREEN}✅ Backup created successfully${NC}"
}

# Function to wipe data only
wipe_data() {
    echo -e "${YELLOW}⚠️  WARNING: This will delete all data but keep the schema!${NC}"
    echo "Database: $DB_PATH"
    echo "Press Ctrl+C to cancel, or press Enter to continue..."
    read

    echo "Wiping database data..."

    sqlite3 "$DB_PATH" <<EOF
PRAGMA foreign_keys = OFF;
DELETE FROM patient_owners;
DELETE FROM patient_households;
DELETE FROM person_contacts;
DELETE FROM people;
DELETE FROM households;
DELETE FROM patients;
DELETE FROM owners;
DELETE FROM sqlite_sequence;
PRAGMA foreign_keys = ON;
VACUUM;
EOF

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database data wiped successfully${NC}"
    else
        echo -e "${RED}❌ Failed to wipe database data${NC}"
        exit 1
    fi
}

# Function to fully reset database
reset_database() {
    echo -e "${YELLOW}⚠️  WARNING: This will delete all tables and data!${NC}"
    echo "Database: $DB_PATH"
    echo "Press Ctrl+C to cancel, or press Enter to continue..."
    read

    echo "Resetting database..."

    # Get list of all tables
    TABLES=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table';")

    # Drop all tables
    for TABLE in $TABLES; do
        echo "Dropping table: $TABLE"
        sqlite3 "$DB_PATH" "DROP TABLE IF EXISTS $TABLE;"
    done

    # Drop all views
    VIEWS=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='view';")
    for VIEW in $VIEWS; do
        echo "Dropping view: $VIEW"
        sqlite3 "$DB_PATH" "DROP VIEW IF EXISTS $VIEW;"
    done

    # Vacuum to clean up
    sqlite3 "$DB_PATH" "VACUUM;"

    echo -e "${GREEN}✅ Database reset successfully${NC}"
    echo ""
    echo "Note: Tables will be recreated when you next run the application."
}

# Parse command line arguments
case "$1" in
    --help|-h)
        show_help
        ;;
    --wipe|-w)
        wipe_data
        ;;
    --backup|-b)
        create_backup
        reset_database
        ;;
    --reset|-r|"")
        reset_database
        ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        echo "Use --help for usage information"
        exit 1
        ;;
esac