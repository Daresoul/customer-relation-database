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

// Update tauri.conf.json — only write if the version actually changed.
// Touching the file with identical content still bumps mtime, which makes
// Tauri re-run codegen and Cargo invalidate the bin crate's cached
// compilation. Both files combined cost ~30-60s of unnecessary rebuild
// per release.
const tauriPath = 'src-tauri/tauri.conf.json';
const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
if (tauriConf.package.version !== version) {
    tauriConf.package.version = version;
    fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log(`Updated ${tauriPath} to ${version}`);
} else {
    console.log(`${tauriPath} already at ${version}, skipping write`);
}

// Update Cargo.toml — same logic. Content-comparison guards against
// mtime bumps that would force `cargo build --release` to re-link the
// bin crate even when sources are otherwise unchanged.
const cargoPath = 'src-tauri/Cargo.toml';
const cargoBefore = fs.readFileSync(cargoPath, 'utf8');
const cargoAfter = cargoBefore.replace(
    /^version = "[^"]*"/m,
    `version = "${version}"`,
);
if (cargoAfter !== cargoBefore) {
    fs.writeFileSync(cargoPath, cargoAfter);
    console.log(`Updated ${cargoPath} to ${version}`);
} else {
    console.log(`${cargoPath} already at ${version}, skipping write`);
}
