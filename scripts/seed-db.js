#!/usr/bin/env node

/* Seed the database with demo data via Tauri command */
import { invoke } from '@tauri-apps/api/core.js';

async function main() {
  const households = parseInt(process.argv[2] || '1000', 10);
  console.log(`Seeding ${households} households (1-5 pets each)...`);
  console.log(`This will create approximately ${households * 3} pets and ${households * 10} medical records`);
  try {
    const res = await invoke('populate_database', { households });
    console.log('✅', res);
  } catch (err) {
    console.error('❌ Failed to seed database:', err);
    process.exit(1);
  }
}

main();

