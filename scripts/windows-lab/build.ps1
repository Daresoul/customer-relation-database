<#
  Builds the Windows installer on the lab machine from C:\ArkivetLab\src
  (the branch arrives as a git bundle; see `appctl build`). A normal release
  build with three lab-only changes, all from a merged config file (--config):
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
# Like the release workflow: the app looks for pdf-generator-<app version>.jar.
$labVersion = $Version
New-Item -ItemType Directory -Force src-tauri\resources | Out-Null
Remove-Item src-tauri\resources\pdf-generator*.jar -ErrorAction SilentlyContinue
Copy-Item pdf-generator-cli\build\libs\pdf-generator-cli-1.0.0.jar "src-tauri\resources\pdf-generator-$labVersion.jar" -Force

Write-Host '==> Tauri build (NSIS)'
$labKey = 'C:\ArkivetLab\state\lab-updater.key'
if (-not (Test-Path $labKey)) { & npx.cmd tauri signer generate -w $labKey -p 'lab' --ci | Out-Null }
$env:TAURI_PRIVATE_KEY = Get-Content $labKey -Raw
$env:TAURI_KEY_PASSWORD = 'lab'
# Tauri replaces wry's default WebView2 arguments when this is set, so the
# defaults go first.
$window = (Get-Content src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).tauri.windows[0]
$window | Add-Member -NotePropertyName additionalBrowserArgs -NotePropertyValue '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222' -Force
$labConfig = 'C:\ArkivetLab\state\lab-tauri.json'
$labPub = (Get-Content "$labKey.pub" -Raw).Trim()
$updater = @{ active = $true; dialog = $false; pubkey = $labPub; endpoints = @('http://127.0.0.1:8899/latest.json'); windows = @{ installMode = 'passive' } }
@{ package = @{ version = $labVersion }; tauri = @{ windows = @($window); updater = $updater } } | ConvertTo-Json -Depth 6 |
  Set-Content $labConfig -Encoding ascii
# Tauri 1 rejects an http update address only when its build helpers have no
# debug checks; turning them on lets the lab use its local http server.
$env:CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_DEBUG_ASSERTIONS = 'true'
& npm.cmd run tauri build -- --bundles nsis --config $labConfig
if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }

$setup = Get-ChildItem src-tauri\target\release\bundle\nsis\*-setup.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $setup.FullName C:\ArkivetLab\builds\ -Force
# The signed update bundle, for appctl update-serve.
Get-ChildItem src-tauri\target\release\bundle\nsis\*$labVersion*.nsis.zip* | Copy-Item -Destination C:\ArkivetLab\builds\ -Force
Join-Path 'C:\ArkivetLab\builds' $setup.Name
