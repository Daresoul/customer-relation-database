<#
  One-time setup of the Arkivet Windows test lab. Test machine only, never a
  clinic PC: it opens SSH and lets the lab agent start the app with a
  DevTools port (localhost only).

  Run in an elevated PowerShell, logged in as the user the lab runs as:

    powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1 -AuthorizedKey "ssh-ed25519 AAAA... arkivet-lab"

  It refuses a PC that already holds Arkivet clinic data (no lab marker).
  It:
    - turns on the OpenSSH server (PowerShell as the SSH shell, keys only) and adds the key
    - writes the lab marker C:\ArkivetLab\state\IS_LAB, which the agent's reset requires
    - installs Java 17 (PDFs) and Node LTS (clinic simulator) with winget
    - creates virtual COM port pairs with com0com if it is installed
    - creates C:\ArkivetLab, the agent token and lab.json
    - lets the agent listen on 127.0.0.1:8787 and registers it to start at logon
    - keeps the PC awake, like a clinic PC
  Afterwards, from the Mac: scripts/appctl provision
#>
param(
  [Parameter(Mandatory = $true)][string]$AuthorizedKey,
  [string]$LabUser = "$env:USERDOMAIN\$env:USERNAME"
)
$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an elevated PowerShell (Run as administrator).'
}

$Lab = 'C:\ArkivetLab'
$LabMarker = Join-Path $Lab 'state\IS_LAB'
function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }

# A PC with Arkivet data and no lab marker is a clinic PC (or one in use):
# the lab would open SSH on it and its reset would replace that data.
if ((Test-Path "$env:APPDATA\com.vetclinic.app\vet_clinic.db") -and -not (Test-Path $LabMarker)) {
  throw 'This PC has Arkivet clinic data. The test lab is for test machines only; nothing was changed.'
}

Step 'Lab folders'
foreach ($d in 'state', 'builds', 'exigo', 'shots', 'fixtures', 'clinic-sim', 'logs') {
  New-Item -ItemType Directory -Force (Join-Path $Lab $d) | Out-Null
}
# Only this user (and admins) can read the agent token.
icacls (Join-Path $Lab 'state') /inheritance:r /grant:r "${LabUser}:(OI)(CI)F" "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" | Out-Null
# The lab agent's reset only runs where this marker is.
Set-Content -Path $LabMarker -Value "Arkivet test lab, set up $(Get-Date -Format 'yyyy-MM-dd') for $LabUser" -Encoding ascii

Step 'OpenSSH server'
$cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server*'
if ($cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $cap.Name | Out-Null }
Set-Service sshd -StartupType Automatic
Start-Service sshd
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null
# Keys only: the default also accepts passwords.
$sshdConfig = 'C:\ProgramData\ssh\sshd_config'
if (Test-Path $sshdConfig) {
  $conf = Get-Content $sshdConfig | Where-Object { $_ -notmatch '^\s*#?\s*PasswordAuthentication\s' }
  Set-Content -Path $sshdConfig -Value (@('PasswordAuthentication no') + $conf) -Encoding ascii
  Restart-Service sshd
}

Step 'SSH key'
$shortName = $LabUser.Split('\')[-1]
$isAdmin = @(Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name.Split('\')[-1] -eq $shortName }).Count -gt 0
if ($isAdmin) {
  # Windows OpenSSH reads admins' keys from here, not from the profile.
  $keys = 'C:\ProgramData\ssh\administrators_authorized_keys'
  Add-Content -Path $keys -Value $AuthorizedKey
  icacls $keys /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
} else {
  $sshDir = Join-Path $env:USERPROFILE '.ssh'
  New-Item -ItemType Directory -Force $sshDir | Out-Null
  Add-Content -Path (Join-Path $sshDir 'authorized_keys') -Value $AuthorizedKey
}

Step 'Java 17 and Node LTS'
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
function Test-Java { [bool](Get-ChildItem "$env:ProgramFiles\Eclipse Adoptium" -Filter java.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1) }
if (-not (Test-Java)) {
  if ($hasWinget) {
    winget install --id EclipseAdoptium.Temurin.17.JRE -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
  } else {
    # Windows Server has no winget: the official Adoptium installer.
    $msi = Join-Path $env:TEMP 'temurin17-jre.msi'
    Invoke-WebRequest 'https://api.adoptium.net/v3/installer/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse' -OutFile $msi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList '/i', "`"$msi`"", '/qn', 'ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJavaHome' -Wait
  }
}
if (-not (Test-Path "$env:ProgramFiles\nodejs\node.exe")) {
  if ($hasWinget) { winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Null }
  else { Write-Warning 'Node.js is missing and winget is not available: install Node LTS for the clinic simulator.' }
}

Step 'Virtual COM ports (com0com)'
$setupc = @("${env:ProgramFiles(x86)}\com0com\setupc.exe", "$env:ProgramFiles\com0com\setupc.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($setupc) {
  Push-Location (Split-Path $setupc)
  # App side COM20/22/24, simulator side COM21/23/25.
  foreach ($pair in @('COM20', 'COM21'), @('COM22', 'COM23'), @('COM24', 'COM25')) {
    & $setupc install "PortName=$($pair[0])" "PortName=$($pair[1])" | Out-Null
  }
  Pop-Location
} else {
  Write-Warning 'com0com is not installed. Install the signed x64 build (com0com-3.0.0.0-i386-and-x64-signed) and run this script again for the COM pairs. Folder (Exigo) testing works without it.'
}

Step 'Agent token, lab.json, URL reservation'
$tokenFile = Join-Path $Lab 'state\agent.token'
if (-not (Test-Path $tokenFile)) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [IO.File]::WriteAllText($tokenFile, (($bytes | ForEach-Object { $_.ToString('x2') }) -join ''))
}
$labJson = Join-Path $Lab 'lab.json'
if (-not (Test-Path $labJson)) {
  @{
    ports = @{ pointcare = 'COM21'; healvet = 'COM23'; pcr = 'COM25' }
    baudRates = @{ pointcare = 9600; healvet = 9600; pcr = 9600 }
    exigoFolder = (Join-Path $Lab 'exigo')
    fixtures = (Join-Path $Lab 'fixtures')
  } | ConvertTo-Json | Set-Content $labJson -Encoding UTF8
}
netsh http delete urlacl url=http://127.0.0.1:8787/ 2>$null | Out-Null
netsh http add urlacl url=http://127.0.0.1:8787/ user=$LabUser | Out-Null

Step 'Lab agent at logon'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Lab\lab-agent.ps1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $LabUser
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $LabUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'ArkivetLabAgent' -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Force | Out-Null

Step 'Keep the PC awake'
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0

Write-Host ''
Write-Host 'Done. Next:' -ForegroundColor Green
Write-Host "  1. Turn on auto-logon for $LabUser (Sysinternals Autologon), so the lab agent runs after a reboot."
Write-Host '  2. On the Mac: scripts/appctl provision'
Write-Host ''
Write-Host 'This machine is reachable at:'
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } | ForEach-Object { "  $($_.IPAddress)  ($($_.InterfaceAlias))" }
