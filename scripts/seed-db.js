#!/usr/bin/env node

/* Seed the database with demo data via Tauri command */
const { invoke } = require('@tauri-apps/api');

async function main() {
  const households = parseInt(process.argv[2] || '1000', 10);
  console.log(`Seeding ${households} households (1-5 pets each; 1-5 procedures + 1-5 notes per pet)...`);
  try {
    const res = await invoke('populate_database', { households });
    console.log('✅', res);
  } catch (err) {
    console.error('❌ Failed to seed database:', err);
    process.exit(1);
  }
}

main();

