const fs = require('fs');

const version = process.env.GITHUB_REF_NAME.replace('v', '');

// Update tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tauriConf.package.version = version;
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauriConf, null, 2) + '\n');

// Update Cargo.toml
let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace(/^version = "[^"]*"/m, `version = "${version}"`);
fs.writeFileSync('src-tauri/Cargo.toml', cargo);

console.log(`Updated version to ${version}`);
