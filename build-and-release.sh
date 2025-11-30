#!/bin/bash
# Local build and release script for Veterinary Clinic Manager
# This script builds and releases both macOS and Windows versions
#
# Usage:
#   ./build-and-release.sh v0.2.23
#
# Prerequisites:
#   - macOS build runs natively
#   - Windows build must be run in Windows VM (see build-windows.ps1)
#   - GitHub CLI (gh) must be authenticated: gh auth login
#
# Optional (for auto-updater signing):
#   export TAURI_PRIVATE_KEY=$(cat ~/.tauri/vet-clinic.key)
#   export TAURI_KEY_PASSWORD='your-password-here'

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Version tag required"
    echo "Usage: ./build-and-release.sh v0.2.23"
    exit 1
fi

VERSION_TAG="$1"
VERSION_NUMBER="${VERSION_TAG#v}"

echo "🚀 Building and releasing version $VERSION_TAG"
echo ""

# Check if gh is authenticated
if ! gh auth status &>/dev/null; then
    echo "❌ GitHub CLI not authenticated. Please run: gh auth login"
    exit 1
fi

# Check for Tauri signing keys (for auto-updater)
if [ -z "$TAURI_PRIVATE_KEY" ]; then
    echo "⚠️  Warning: TAURI_PRIVATE_KEY not set - auto-updater signing will be skipped"
    echo "   To enable signing, export the key from ~/.tauri/vet-clinic.key:"
    echo "   export TAURI_PRIVATE_KEY=\$(cat ~/.tauri/vet-clinic.key)"
    echo "   export TAURI_KEY_PASSWORD='your-password-here'"
    echo ""
    read -p "Continue without signing? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Aborted"
        exit 1
    fi
fi

# Check if tag already exists
if git rev-parse "$VERSION_TAG" >/dev/null 2>&1; then
    echo "⚠️  Tag $VERSION_TAG already exists locally"
    read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "$VERSION_TAG"
        git push origin --delete "$VERSION_TAG" 2>/dev/null || true
    else
        echo "❌ Aborted"
        exit 1
    fi
fi

# Update version in tauri.conf.json
echo "📝 Updating version to $VERSION_NUMBER..."
export GITHUB_REF_NAME="$VERSION_TAG"
node .github/scripts/update-version.cjs

# Build Java PDF Generator
echo ""
echo "☕ Building Java PDF Generator..."
cd pdf-generator-cli
chmod +x gradlew
./gradlew clean build
cd ..

# Copy JAR to resources
echo "📦 Copying JAR to resources..."
mkdir -p src-tauri/resources
cp pdf-generator-cli/build/libs/pdf-generator-cli-1.0.0.jar src-tauri/resources/pdf-generator.jar

# Build macOS version
echo ""
echo "🍎 Building macOS version..."
npm run tauri build

MACOS_DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" | head -n 1)
MACOS_APP=$(find src-tauri/target/release/bundle/macos -name "*.app" | head -n 1)

if [ ! -f "$MACOS_DMG" ]; then
    echo "❌ macOS DMG not found"
    exit 1
fi

echo "✅ macOS build complete: $MACOS_DMG"

# Copy Windows builds from versioned shared folder
echo ""
echo "📥 Looking for Windows builds for $VERSION_TAG..."
WINDOWS_BUILDS_FOLDER="$HOME/Documents/Windows/shared/customer-relation-database/builds/$VERSION_TAG"

if [ ! -d "$WINDOWS_BUILDS_FOLDER" ]; then
    echo "❌ Windows builds not found at: $WINDOWS_BUILDS_FOLDER"
    echo ""
    echo "Please build Windows installers first in your Windows VM:"
    echo "   1. Open PowerShell in Windows VM"
    echo "   2. Navigate to: cd C:\\Users\\Build Server\\git_builds\\customer-relation-database"
    echo "   3. Pull latest changes: git pull origin main"
    echo "   4. Set signing keys:"
    echo "      \$env:TAURI_PRIVATE_KEY = Get-Content -Raw Z:\\customer-relation-database\\.tauri-vet-clinic.key"
    echo "      \$env:TAURI_KEY_PASSWORD = 'xx1234567'"
    echo "   5. Run: .\\build-windows.ps1 $VERSION_TAG"
    exit 1
fi

echo "✅ Found Windows builds, copying..."
mkdir -p src-tauri/target/release/bundle/msi
mkdir -p src-tauri/target/release/bundle/nsis

if [ -d "$WINDOWS_BUILDS_FOLDER/msi" ]; then
    cp -v "$WINDOWS_BUILDS_FOLDER"/msi/*.msi src-tauri/target/release/bundle/msi/ 2>/dev/null || true
fi
if [ -d "$WINDOWS_BUILDS_FOLDER/nsis" ]; then
    cp -v "$WINDOWS_BUILDS_FOLDER"/nsis/*-setup.exe src-tauri/target/release/bundle/nsis/ 2>/dev/null || true
    cp -v "$WINDOWS_BUILDS_FOLDER"/nsis/*.nsis.zip src-tauri/target/release/bundle/nsis/ 2>/dev/null || true
    cp -v "$WINDOWS_BUILDS_FOLDER"/nsis/*.sig src-tauri/target/release/bundle/nsis/ 2>/dev/null || true
fi

# Find Windows installers
WINDOWS_MSI=$(find src-tauri/target/release/bundle/msi -name "*.msi" 2>/dev/null | head -n 1)
WINDOWS_NSIS=$(find src-tauri/target/release/bundle/nsis -name "*-setup.exe" 2>/dev/null | head -n 1)

if [ -z "$WINDOWS_MSI" ] && [ -z "$WINDOWS_NSIS" ]; then
    echo "❌ No Windows installers found"
    echo "   Expected locations:"
    echo "   - src-tauri/target/release/bundle/msi/*.msi"
    echo "   - src-tauri/target/release/bundle/nsis/*-setup.exe"
    exit 1
fi

# Create git tag
echo ""
echo "🏷️  Creating git tag $VERSION_TAG..."
git add -A
git commit -m "Release $VERSION_TAG" || true
git tag "$VERSION_TAG"
git push origin main
git push origin "$VERSION_TAG"

# Create GitHub release
echo ""
echo "📦 Creating GitHub release..."
gh release create "$VERSION_TAG" \
    --title "Veterinary Clinic Manager $VERSION_TAG" \
    --notes "See the assets to download and install this version." \
    --verify-tag

# Upload macOS assets
echo ""
echo "⬆️  Uploading macOS DMG..."
gh release upload "$VERSION_TAG" "$MACOS_DMG"

# Upload Windows assets
if [ -n "$WINDOWS_MSI" ]; then
    echo "⬆️  Uploading Windows MSI..."
    gh release upload "$VERSION_TAG" "$WINDOWS_MSI"
fi

if [ -n "$WINDOWS_NSIS" ]; then
    echo "⬆️  Uploading Windows NSIS installer..."
    gh release upload "$VERSION_TAG" "$WINDOWS_NSIS"

    # Also upload NSIS .nsis.zip if it exists (for updater)
    NSIS_ZIP=$(find src-tauri/target/release/bundle/nsis -name "*.nsis.zip" 2>/dev/null | head -n 1)
    if [ -n "$NSIS_ZIP" ]; then
        echo "⬆️  Uploading NSIS updater package..."
        gh release upload "$VERSION_TAG" "$NSIS_ZIP"
    fi
fi

# Upload updater signatures
echo "⬆️  Uploading updater signatures..."
find src-tauri/target/release/bundle -name "*.sig" -exec gh release upload "$VERSION_TAG" {} \;

echo ""
echo "✅ Release $VERSION_TAG complete!"
echo "🔗 https://github.com/Daresoul/customer-relation-database/releases/tag/$VERSION_TAG"
