<#
  Builds the Windows installer on the lab machine from C:\ArkivetLab\src
  (the branch arrives as a git bundle; see `appctl build`). A normal release
  build with three lab-only changes, all through TAURI_CONFIG:
    - the window's WebView2 gets a DevTools port (localhost) for Playwright;
    - version 0.99.0, so the real update check never offers v0.7.x;
    - update files are signed with a throwaway lab key (the real one stays in CI).
  Output: the NSIS setup.exe path on the last line.
#>
$ErrorActionPreference = 'Stop'
$src = 'C:\ArkivetLab\src'

$javac = Get-ChildItem 'C:\actions-runner\_work\_tool\Java_Temurin-Hotspot_jdk', "$env:ProgramFiles\Eclipse Adoptium" -Recurse -Filter javac.exe -Depth 4 -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
# The runtime bootstrap installs has no compiler; the PDF generator needs a JDK.
$env:JAVA_HOME = if ($javac) { Split-Path (Split-Path $javac.FullName) } else { $null }
if (-not $env:JAVA_HOME) { throw 'No JDK found for the PDF generator build' }
$env:Path = "$env:JAVA_HOME\bin;$env:USERPROFILE\.cargo\bin;$env:ProgramFiles\nodejs;$env:Path"

Set-Location $src
Write-Host '==> npm ci'
& npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

Write-Host '==> PDF generator JAR'
Push-Location pdf-generator-cli
& .\gradlew.bat build -x test -q
if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }
Pop-Location
New-Item -ItemType Directory -Force src-tauri\resources | Out-Null
Copy-Item pdf-generator-cli\build\libs\pdf-generator-cli-*.jar src-tauri\resources\ -Force

Write-Host '==> Tauri build (NSIS)'
$labKey = 'C:\ArkivetLab\state\lab-updater.key'
if (-not (Test-Path $labKey)) { & npx.cmd tauri signer generate -w $labKey -p 'lab' --ci | Out-Null }
$env:TAURI_PRIVATE_KEY = Get-Content $labKey -Raw
$env:TAURI_KEY_PASSWORD = 'lab'
# Tauri replaces wry's default WebView2 arguments when this is set, so the
# defaults go first.
$window = (Get-Content src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).tauri.windows[0]
$window | Add-Member -NotePropertyName additionalBrowserArgs -NotePropertyValue '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222' -Force
$env:TAURI_CONFIG = @{ package = @{ version = '0.99.0' }; tauri = @{ windows = @($window) } } | ConvertTo-Json -Depth 6 -Compress
& npm.cmd run tauri build -- --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }

$setup = Get-ChildItem src-tauri\target\release\bundle\nsis\*-setup.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $setup.FullName C:\ArkivetLab\builds\ -Force
Join-Path 'C:\ArkivetLab\builds' $setup.Name
