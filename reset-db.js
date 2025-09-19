#!/usr/bin/env node

/**
 * Script to reset the database
 * Run with: node reset-db.js
 */

const { invoke } = require('@tauri-apps/api');

async function resetDatabase() {
  console.log('⚠️  WARNING: This will delete all data in the database!');
  console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    console.log('Resetting database...');
    const result = await invoke('reset_database');
    console.log('✅', result);
  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    process.exit(1);
  }
}

async function wipeData() {
  console.log('⚠️  WARNING: This will delete all data but keep the schema!');
  console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    console.log('Wiping database data...');
    const result = await invoke('wipe_database_data');
    console.log('✅', result);
  } catch (error) {
    console.error('❌ Failed to wipe data:', error);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === '--wipe' || command === '-w') {
  console.log('Database Data Wipe (keeps schema)\n');
  wipeData();
} else if (command === '--reset' || command === '-r' || !command) {
  console.log('Database Full Reset (drops and recreates all tables)\n');
  resetDatabase();
} else if (command === '--help' || command === '-h') {
  console.log(`
Database Management Tool

Usage:
  node reset-db.js [options]

Options:
  --reset, -r    Full reset - drops all tables and recreates (default)
  --wipe, -w     Wipe data only - deletes all records but keeps schema
  --help, -h     Show this help message

Examples:
  node reset-db.js          # Full reset
  node reset-db.js --wipe   # Keep schema, delete data only
`);
} else {
  console.error(`Unknown command: ${command}`);
  console.log('Use --help for usage information');
  process.exit(1);
}