# Windows build script for Veterinary Clinic Manager
# Usage: .\build-windows.ps1 v0.2.23

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$totalTimer = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "`n=== Building Windows $Version ===" -ForegroundColor Cyan

# Check prerequisites
if ($env:OS -ne "Windows_NT") {
    Write-Host "ERROR: Must run on Windows" -ForegroundColor Red
    exit 1
}

$tools = @("node", "cargo", "java")
foreach ($tool in $tools) {
    if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: $tool not found" -ForegroundColor Red
        exit 1
    }
}

# Update version in tauri.conf.json and Cargo.toml
Write-Host "`nUpdating version..." -NoNewline
$env:GITHUB_REF_NAME = $Version
node .github/scripts/update-version.cjs
if ($LASTEXITCODE -ne 0) {
    Write-Host " [FAILED]" -ForegroundColor Red
    exit 1
}
Write-Host " [OK]" -ForegroundColor Green

# npm install
Write-Host "`nnpm install..." -NoNewline
$time = Measure-Command {
    npm install 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}
Write-Host " [$($time.TotalMinutes.ToString('0.0'))m]" -ForegroundColor Green

# Java build
Write-Host "Java build..." -NoNewline
Set-Location pdf-generator-cli
$time = Measure-Command {
    .\gradlew.bat clean build 2>&1 | Out-Null
}
if ($LASTEXITCODE -ne 0) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "Run '.\gradlew.bat clean build' in pdf-generator-cli to see errors" -ForegroundColor Yellow
    Set-Location ..
    exit 1
}
Set-Location ..
Write-Host " [$($time.TotalSeconds.ToString('0.0'))s]" -ForegroundColor Green

# Copy JAR
New-Item -ItemType Directory -Force -Path src-tauri/resources *>$null
Copy-Item pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar src-tauri/resources/pdf-generator.jar

# Tauri build (includes Vite + Rust)
Write-Host "Tauri build (Vite + Rust)..." -NoNewline
$time = Measure-Command {
    npm run tauri build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
}
Write-Host " [$($time.TotalMinutes.ToString('0.0'))m]" -ForegroundColor Green

# Find installers
$msi = Get-ChildItem -Path src-tauri/target/release/bundle/msi -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsis = Get-ChildItem -Path src-tauri/target/release/bundle/nsis -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

# Copy to shared folder
$sharedFolder = "Z:\customer-relation-database\builds\$Version"
New-Item -ItemType Directory -Force -Path "$sharedFolder\msi" *>$null
New-Item -ItemType Directory -Force -Path "$sharedFolder\nsis" *>$null

Write-Host "Copying to shared..." -NoNewline
if ($msi) {
    Copy-Item $msi.FullName "$sharedFolder\msi\" -Force
}
if ($nsis) {
    Copy-Item "$($nsis.DirectoryName)\*" "$sharedFolder\nsis\" -Force -Recurse
}
Write-Host " [OK]" -ForegroundColor Green

$totalTimer.Stop()
Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Total time: $($totalTimer.Elapsed.ToString('mm\:ss'))" -ForegroundColor Cyan
Write-Host "Artifacts: $sharedFolder" -ForegroundColor Gray
