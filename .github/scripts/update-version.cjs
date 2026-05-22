const fs = require('fs');

// Prefer RELEASE_VERSION (explicit, can be overridden in workflows) over
// GITHUB_REF_NAME, which is a GitHub-reserved env var the runner sets to the
// branch name on workflow_dispatch (e.g. "main") and cannot be overridden via
// a step-level `env:` block.
const refName = process.env.RELEASE_VERSION || process.env.GITHUB_REF_NAME;
if (!refName) {
    console.error('Error: neither RELEASE_VERSION nor GITHUB_REF_NAME is set');
    console.error('This script should be run from the release workflow');
    process.exit(1);
}
const version = refName.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`Error: "${refName}" is not a semver-shaped version`);
    console.error('Expected something like v0.4.0 or 0.4.0');
    process.exit(1);
}

// Update tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tauriConf.package.version = version;
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauriConf, null, 2) + '\n');

// Update Cargo.toml
let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace(/^version = "[^"]*"/m, `version = "${version}"`);
fs.writeFileSync('src-tauri/Cargo.toml', cargo);

console.log(`Updated version to ${version}`);
