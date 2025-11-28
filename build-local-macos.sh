#!/bin/bash
# Local macOS build script for Veterinary Clinic Manager
# Run this on your Mac to build the macOS version

set -e

echo "🍎 Building macOS version locally..."

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script must be run on macOS"
    exit 1
fi

# Build Java PDF Generator
echo "☕ Building Java PDF Generator..."
cd pdf-generator-cli
chmod +x gradlew
./gradlew clean build
cd ..

# Copy JAR to resources
echo "📦 Copying JAR to resources..."
mkdir -p src-tauri/resources
cp pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar src-tauri/resources/pdf-generator.jar
ls -lh src-tauri/resources/

# Build Tauri app
echo "🔨 Building Tauri app for macOS..."
npm run tauri build

echo "✅ macOS build complete!"
echo "📍 Build output location:"
echo "   - App: src-tauri/target/release/bundle/macos/Veterinary Clinic Manager.app"
echo "   - DMG: src-tauri/target/release/bundle/dmg/Veterinary Clinic Manager_*.dmg"
