# Windows build script for Veterinary Clinic Manager
# Run this inside your Windows VM to build MSI and NSIS installers
#
# Usage (in PowerShell):
#   .\build-windows.ps1

Write-Host "🪟 Building Windows version..." -ForegroundColor Cyan

# Check if we're on Windows
if ($env:OS -ne "Windows_NT") {
    Write-Host "❌ This script must be run on Windows" -ForegroundColor Red
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
        Write-Host "❌ $($tool.Value) not found. Please install it first." -ForegroundColor Red
        exit 1
    }
}

Write-Host "✅ All prerequisites found" -ForegroundColor Green

# Install npm dependencies
Write-Host "`n📦 Installing npm dependencies..." -ForegroundColor Cyan
npm install

# Build Java PDF Generator
Write-Host "`n☕ Building Java PDF Generator..." -ForegroundColor Cyan
Set-Location pdf-generator-cli
.\gradlew.bat clean build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Java build failed" -ForegroundColor Red
    exit 1
}
Set-Location ..

# Copy JAR to resources
Write-Host "`n📦 Copying JAR to resources..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path src-tauri/resources | Out-Null
Copy-Item pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar src-tauri/resources/pdf-generator.jar
Get-ChildItem src-tauri/resources/

# Build Tauri app (both MSI and NSIS)
Write-Host "`n🔨 Building Tauri app for Windows..." -ForegroundColor Cyan
npm run tauri build

# Check if builds succeeded
$msi = Get-ChildItem -Path src-tauri/target/release/bundle/msi -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$nsis = Get-ChildItem -Path src-tauri/target/release/bundle/nsis -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($msi) {
    Write-Host "`n✅ MSI installer created: $($msi.FullName)" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  No MSI installer found" -ForegroundColor Yellow
}

if ($nsis) {
    Write-Host "✅ NSIS installer created: $($nsis.FullName)" -ForegroundColor Green
} else {
    Write-Host "⚠️  No NSIS installer found" -ForegroundColor Yellow
}

Write-Host "`n✅ Windows build complete!" -ForegroundColor Green
Write-Host "📍 Build outputs:" -ForegroundColor Cyan
Write-Host "   - MSI: src-tauri\target\release\bundle\msi\" -ForegroundColor Gray
Write-Host "   - NSIS: src-tauri\target\release\bundle\nsis\" -ForegroundColor Gray
Write-Host "`nThe build artifacts are now ready to be uploaded from your Mac." -ForegroundColor Cyan
