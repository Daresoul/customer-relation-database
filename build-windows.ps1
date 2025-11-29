# Windows build script for Veterinary Clinic Manager
# Run this inside your Windows VM to build MSI and NSIS installers
#
# Usage (in PowerShell):
#   .\build-windows.ps1 v0.2.23

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

Write-Host "Building Windows version $Version..." -ForegroundColor Cyan

# Check if we're on Windows
if ($env:OS -ne "Windows_NT") {
    Write-Host "ERROR: This script must be run on Windows" -ForegroundColor Red
    exit 1
}

# Check prerequisites
$tools = @{
    "node" = "Node.js"
    "cargo" = "Rust"
    "java" = "Java JDK"
}

foreach ($tool in $tools.GetEnumerator()) {
    if (!(Get-Command $tool.Key -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: $($tool.Value) not found. Please install it first." -ForegroundColor Red
        exit 1
    }
}

Write-Host "All prerequisites found" -ForegroundColor Green

# Install npm dependencies
Write-Host "`nInstalling npm dependencies..." -ForegroundColor Cyan
npm install

# Build Java PDF Generator
Write-Host "`nBuilding Java PDF Generator..." -ForegroundColor Cyan
Set-Location pdf-generator-cli
.\gradlew.bat clean build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Java build failed" -ForegroundColor Red
    exit 1
}
Set-Location ..

# Copy JAR to resources
Write-Host "`nCopying JAR to resources..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path src-tauri/resources | Out-Null
Copy-Item pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar src-tauri/resources/pdf-generator.jar
Get-ChildItem src-tauri/resources/

# Build Tauri app (both MSI and NSIS)
Write-Host "`nBuilding Tauri app for Windows..." -ForegroundColor Cyan
npm run tauri build

# Check if builds succeeded
$msi = Get-ChildItem -Path src-tauri/target/release/bundle/msi -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsis = Get-ChildItem -Path src-tauri/target/release/bundle/nsis -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($msi) {
    Write-Host "`nSUCCESS: MSI installer created: $($msi.FullName)" -ForegroundColor Green
} else {
    Write-Host "`nWARNING: No MSI installer found" -ForegroundColor Yellow
}

if ($nsis) {
    Write-Host "SUCCESS: NSIS installer created: $($nsis.FullName)" -ForegroundColor Green
} else {
    Write-Host "WARNING: No NSIS installer found" -ForegroundColor Yellow
}

Write-Host "`nWindows build complete!" -ForegroundColor Green
Write-Host "Build outputs:" -ForegroundColor Cyan
Write-Host "   - MSI: src-tauri\target\release\bundle\msi\" -ForegroundColor Gray
Write-Host "   - NSIS: src-tauri\target\release\bundle\nsis\" -ForegroundColor Gray

# Copy build artifacts to versioned shared folder for Mac to pick up
$sharedFolder = "Z:\customer-relation-database\builds\$Version"
Write-Host "`nCopying build artifacts to shared folder: $sharedFolder" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$sharedFolder\msi" | Out-Null
New-Item -ItemType Directory -Force -Path "$sharedFolder\nsis" | Out-Null

if ($msi) {
    Copy-Item $msi.FullName "$sharedFolder\msi\" -Force
    Write-Host "Copied MSI to $sharedFolder\msi\" -ForegroundColor Green
}

if ($nsis) {
    Copy-Item "$($nsis.DirectoryName)\*" "$sharedFolder\nsis\" -Force -Recurse
    Write-Host "Copied NSIS installers to $sharedFolder\nsis\" -ForegroundColor Green
}

Write-Host "`nWindows build for $Version complete and ready in shared folder!" -ForegroundColor Green
