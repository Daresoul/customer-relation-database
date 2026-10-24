<#
  Arkivet test lab agent (Windows test machine only, never a clinic PC).

  Started at logon by the "ArkivetLabAgent" scheduled task, so it runs in the
  logged-in desktop session and the app it starts gets a real window. Windows
  doesn't show windows for programs started over SSH; this is the way round.

  Listens on 127.0.0.1:8787 only. Every request needs the token from
  C:\ArkivetLab\state\agent.token in the X-Lab-Token header. Reached from the
  Mac through an SSH tunnel (scripts/appctl).

  Actions (POST /<action>, JSON body):
    status                       app running? DevTools port up?
    start   {hidden}             start the installed app with the DevTools port
    stop                         stop the app
    reset                        stop, restore the demo clinic, empty the Exigo folder
    install {file}               run an installer from C:\ArkivetLab\builds
    shot                         screenshot of the whole desktop (PNG path)
    ui-list {window}             buttons, fields and menu items of the app's windows
    ui-press {name, window}      press a button / menu item by its name
    ui-type {name, text}         set a field's text (e.g. a file dialog's path)
    keys    {keys}               SendKeys to the focused window, e.g. "{ENTER}"
    click   {x, y}               left-click at a point of the desktop screenshot
    com-pairs                    create the virtual COM pairs (com0com) in this desktop session,
                                 so Windows can ask about the driver on screen
    tray    {item}               open the app's tray menu and press an item
#>
$ErrorActionPreference = 'Stop'

$Lab = 'C:\ArkivetLab'
$Prefix = 'http://127.0.0.1:8787/'
$CdpPort = 9222
$AppData = Join-Path $env:APPDATA 'com.vetclinic.app'
$Token = (Get-Content (Join-Path $Lab 'state\agent.token') -Raw).Trim()

Add-Type -AssemblyName System.Drawing, System.Windows.Forms, UIAutomationClient, UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LabNative {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
}
'@
# Real pixels on high-DPI screens.
[void][LabNative]::SetProcessDPIAware()

function Find-AppExe {
  foreach ($c in @((Join-Path $env:LOCALAPPDATA 'Arkivet\Arkivet.exe'), (Join-Path $env:ProgramFiles 'Arkivet\Arkivet.exe'))) {
    if (Test-Path $c) { return $c }
  }
  throw 'Arkivet is not installed (looked in LOCALAPPDATA\Arkivet and Program Files\Arkivet)'
}

# vet-clinic.exe: dev and e2e builds of the same app (same data folder).
function Get-AppProcess { @(Get-Process -Name 'Arkivet', 'vet-clinic' -ErrorAction SilentlyContinue) }

function Get-Status {
  $cdp = $false
  try {
    Invoke-WebRequest "http://127.0.0.1:$CdpPort/json/version" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $cdp = $true
  } catch {}
  $procs = Get-AppProcess
  @{ running = ($procs.Count -gt 0); pids = @($procs | ForEach-Object Id); devtools = $cdp; appData = $AppData }
}

function Start-App($body) {
  if ((Get-AppProcess).Count -gt 0) { return @{ started = $false; reason = 'already running' } }
  $exe = Find-AppExe
  # WebView2 reads this when the app creates its webview; Playwright attaches
  # to the DevTools port, which listens on localhost only.
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$CdpPort"
  if ($body -and $body.hidden) { $p = Start-Process -FilePath $exe -ArgumentList '--hidden' -PassThru }
  else { $p = Start-Process -FilePath $exe -PassThru }
  @{ started = $true; pid = $p.Id; exe = $exe }
}

function Stop-App {
  $procs = Get-AppProcess
  if ($procs.Count -gt 0) {
    $procs | Stop-Process -Force
    $procs | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    # WebView2 keeps its browser process (and the profile) a moment longer.
    Get-Process msedgewebview2 -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -and (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -like '*com.vetclinic.app*' } |
      Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
  @{ stopped = ($procs.Count -gt 0) }
}

function Reset-Lab {
  Stop-App | Out-Null
  $snapshot = Join-Path $Lab 'state\demo-clinic'
  if (-not (Test-Path $snapshot)) { throw "No demo clinic at $snapshot (run: appctl provision)" }
  # Keep the logs; everything else comes from the demo clinic.
  New-Item -ItemType Directory -Force $AppData | Out-Null
  Get-ChildItem $AppData -Exclude 'logs' | Remove-Item -Recurse -Force
  Copy-Item (Join-Path $snapshot '*') $AppData -Recurse -Force
  Get-ChildItem (Join-Path $Lab 'exigo') -File -ErrorAction SilentlyContinue | Remove-Item -Force
  @{ reset = $true; appData = $AppData }
}

function Install-Build($body) {
  $file = Join-Path $Lab ('builds\' + [IO.Path]::GetFileName($body.file))
  if (-not (Test-Path $file)) { throw "No such build: $file" }
  Stop-App | Out-Null
  if ($file.EndsWith('.msi')) { $p = Start-Process msiexec.exe -ArgumentList '/i', "`"$file`"", '/qn' -Wait -PassThru }
  else { $p = Start-Process $file -ArgumentList '/S' -Wait -PassThru }
  @{ installed = ($p.ExitCode -eq 0); exitCode = $p.ExitCode; file = $file }
}

function Save-Screenshot {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bmp.Size)
  $dir = Join-Path $Lab 'shots'
  New-Item -ItemType Directory -Force $dir | Out-Null
  $path = Join-Path $dir ("shot-{0:yyyyMMdd-HHmmss-fff}.png" -f (Get-Date))
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  @{ path = $path }
}

# ---- Windows UI Automation: native dialogs (print, save, open) and menus ----

$UIA = [System.Windows.Automation.AutomationElement]
$Tree = [System.Windows.Automation.TreeScope]
$Cond = [System.Windows.Automation.Condition]

function Get-AppWindows($title) {
  $ids = @(Get-AppProcess | ForEach-Object Id)
  $UIA::RootElement.FindAll($Tree::Children, $Cond::TrueCondition) | Where-Object {
    ($ids -contains $_.Current.ProcessId) -and (-not $title -or $_.Current.Name -like "*$title*")
  }
}

function Get-Controls($title) {
  $wanted = 'button', 'edit', 'menu item', 'check box', 'radio button', 'list item', 'combo box', 'tab item', 'hyperlink'
  foreach ($w in Get-AppWindows $title) {
    foreach ($e in $w.FindAll($Tree::Descendants, $Cond::TrueCondition)) {
      $type = $e.Current.LocalizedControlType
      if ($wanted -contains $type -and $e.Current.Name) {
        [pscustomobject]@{ window = $w.Current.Name; type = $type; name = $e.Current.Name; enabled = $e.Current.IsEnabled; element = $e }
      }
    }
  }
}

function Click-Element($e, [switch]$Right) {
  $r = $e.Current.BoundingRectangle
  [void][LabNative]::SetCursorPos([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
  if ($Right) { [LabNative]::mouse_event(0x08, 0, 0, 0, [UIntPtr]::Zero); [LabNative]::mouse_event(0x10, 0, 0, 0, [UIntPtr]::Zero) }
  else { [LabNative]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero); [LabNative]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero) }
}

function Press-Element($e) {
  foreach ($pattern in [System.Windows.Automation.InvokePattern]::Pattern, [System.Windows.Automation.SelectionItemPattern]::Pattern, [System.Windows.Automation.TogglePattern]::Pattern) {
    $p = $null
    if ($e.TryGetCurrentPattern($pattern, [ref]$p)) {
      switch ($p.GetType().Name) {
        'InvokePattern' { $p.Invoke() }
        'SelectionItemPattern' { $p.Select() }
        'TogglePattern' { $p.Toggle() }
      }
      return
    }
  }
  Click-Element $e
}

function Find-Control($name, $title) {
  $hit = Get-Controls $title | Where-Object { $_.name -eq $name } | Select-Object -First 1
  if (-not $hit) { $hit = Get-Controls $title | Where-Object { $_.name -like "*$name*" } | Select-Object -First 1 }
  if (-not $hit) { throw "No control named '$name' in the app's windows" }
  $hit
}

function Open-TrayMenu($item) {
  $taskbar = $UIA::RootElement.FindFirst($Tree::Children,
    (New-Object System.Windows.Automation.PropertyCondition ($UIA::ClassNameProperty), 'Shell_TrayWnd'))
  # Only notification-area icons; the app's taskbar button is also called Arkivet.
  $isIcon = { $_.Current.AutomationId -eq 'NotifyItemIcon' -and $_.Current.Name.Trim() -like 'Arkivet*' }
  $byId = New-Object System.Windows.Automation.PropertyCondition ($UIA::AutomationIdProperty), 'NotifyItemIcon'
  $find = { $UIA::RootElement.FindAll($Tree::Descendants, $byId) | Where-Object $isIcon | Select-Object -First 1 }
  $icon = & $find
  if (-not $icon) {
    # Windows 11 keeps most tray icons behind the "Show hidden icons" chevron.
    $chevron = $taskbar.FindAll($Tree::Descendants, $Cond::TrueCondition) |
      Where-Object { $_.Current.Name -like '*Hidden Icons*' } | Select-Object -First 1
    if ($chevron) { Click-Element $chevron }
    for ($i = 0; $i -lt 10 -and -not $icon; $i++) { Start-Sleep -Milliseconds 300; $icon = & $find }
  }
  if (-not $icon) { throw 'No Arkivet tray icon found, also not behind "Show hidden icons"' }
  Click-Element $icon -Right
  Start-Sleep -Milliseconds 500
  $byName = New-Object System.Windows.Automation.PropertyCondition ($UIA::NameProperty), $item
  $menuItem = $null
  for ($i = 0; $i -lt 10 -and -not $menuItem; $i++) {
    $menuItem = $UIA::RootElement.FindAll($Tree::Descendants, $byName) | Select-Object -First 1
    if (-not $menuItem) { Start-Sleep -Milliseconds 300 }
  }
  if (-not $menuItem) { throw "No tray menu item '$item'" }
  Press-Element $menuItem
  @{ pressed = $item; tooltip = $icon.Current.Name }
}

function Invoke-Action($action, $body) {
  switch ($action) {
    'status' { Get-Status }
    'start' { Start-App $body }
    'stop' { Stop-App }
    'reset' { Reset-Lab }
    'install' { Install-Build $body }
    'shot' { Save-Screenshot }
    'ui-list' { @(Get-Controls $body.window | Select-Object window, type, name, enabled) }
    'ui-press' { $c = Find-Control $body.name $body.window; Press-Element $c.element; @{ pressed = $c.name; window = $c.window } }
    'ui-type' {
      $c = Find-Control $body.name $body.window
      $v = $null
      if ($c.element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$v)) { $v.SetValue($body.text) }
      else { $c.element.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait($body.text) }
      @{ typed = $c.name }
    }
    'keys' { [System.Windows.Forms.SendKeys]::SendWait($body.keys); @{ sent = $body.keys } }
    'click' {
      [void][LabNative]::SetCursorPos([int]$body.x, [int]$body.y)
      [LabNative]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero); [LabNative]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
      @{ clicked = @($body.x, $body.y) }
    }
    'tray' { Open-TrayMenu $body.item }
    'com-pairs' {
      $setupc = "${env:ProgramFiles(x86)}\com0com\setupc.exe"
      if (-not (Test-Path $setupc)) { throw 'com0com is not installed' }
      # Started, not waited for: Windows may show its driver question first.
      $log = Join-Path $Lab 'state\com-pairs.log'
      $existing = [System.IO.Ports.SerialPort]::GetPortNames()
      $missing = 'COM20 COM21', 'COM22 COM23', 'COM24 COM25' | Where-Object { ($_ -split ' ')[0] -notin $existing }
      if (-not $missing) { return @{ started = $false; reason = 'all pairs exist' } }
      $pairs = ($missing | ForEach-Object {
        $a, $b = $_ -split ' '; "setupc.exe install PortName=$a PortName=$b" }) -join ' & '
      Start-Process cmd.exe -WorkingDirectory (Split-Path $setupc) -WindowStyle Minimized -ArgumentList "/c ($pairs) > `"$log`" 2>&1"
      @{ started = $true; log = $log }
    }
    'tray-list' {
      $taskbar = $UIA::RootElement.FindFirst($Tree::Children,
        (New-Object System.Windows.Automation.PropertyCondition ($UIA::ClassNameProperty), 'Shell_TrayWnd'))
      @($UIA::RootElement.FindAll($Tree::Descendants,
          (New-Object System.Windows.Automation.PropertyCondition ($UIA::AutomationIdProperty), 'NotifyItemIcon')) |
        ForEach-Object { @{ name = $_.Current.Name; class = $_.Current.ClassName; id = $_.Current.AutomationId } })
    }
    default { throw "Unknown action '$action'" }
  }
}

function Send-Json($ctx, $status, $object) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($object | ConvertTo-Json -Depth 6 -Compress))
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'application/json'
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($Prefix)
$listener.Start()
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    if ($ctx.Request.Headers['X-Lab-Token'] -ne $Token) { Send-Json $ctx 403 @{ ok = $false; error = 'bad token' }; continue }
    $body = $null
    if ($ctx.Request.HasEntityBody) {
      $raw = (New-Object IO.StreamReader($ctx.Request.InputStream)).ReadToEnd()
      if ($raw.Trim()) { $body = $raw | ConvertFrom-Json }
    }
    $result = Invoke-Action $ctx.Request.Url.AbsolutePath.Trim('/') $body
    Send-Json $ctx 200 @{ ok = $true; result = $result }
  } catch {
    Send-Json $ctx 500 @{ ok = $false; error = $_.Exception.Message }
  }
}
