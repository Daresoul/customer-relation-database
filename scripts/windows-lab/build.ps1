<#
  Builds the Windows installer on the lab machine from C:\ArkivetLab\src
  (the branch arrives as a git bundle; see `appctl build`). A normal release
  build, except the updater is off: the lab has no signing key.
  Output: the NSIS setup.exe path on the last line.
#>
$ErrorActionPreference = 'Stop'
$src = 'C:\ArkivetLab\src'

$jdk = Get-ChildItem 'C:\actions-runner\_work\_tool\Java_Temurin-Hotspot_jdk' -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ChildItem $_.FullName -Directory } | Where-Object { Test-Path (Join-Path $_.FullName 'x64\bin\javac.exe') } |
  Sort-Object Name -Descending | Select-Object -First 1
if ($jdk) { $env:JAVA_HOME = Join-Path $jdk.FullName 'x64' }
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
$env:TAURI_CONFIG = '{"tauri":{"updater":{"active":false}}}'
& npm.cmd run tauri build -- --bundles nsis
if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }

$setup = Get-ChildItem src-tauri\target\release\bundle\nsis\*-setup.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $setup.FullName C:\ArkivetLab\builds\ -Force
Join-Path 'C:\ArkivetLab\builds' $setup.Name
