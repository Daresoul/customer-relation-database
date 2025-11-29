# Serial Port Test Setup Script (Windows)
# This starts the Python serial bridge for testing medical devices

Write-Host "[*] Starting Serial Port Test Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Kill any existing Python serial bridge processes
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*serial_bridge.py*"
} | Stop-Process -Force

Write-Host ""
Write-Host "[*] Starting Python serial bridge..." -ForegroundColor Yellow

# Start the Python bridge in background with Windows config
$bridge = Start-Process python -ArgumentList @("test-scripts/serial_bridge.py", "--config", "test-scripts/device_ports_windows.json") -PassThru -NoNewWindow

# Wait for bridge to initialize
Start-Sleep -Seconds 2

if ($bridge.HasExited) {
    Write-Host "[ERROR] Serial bridge failed to start" -ForegroundColor Red
    Write-Host "        Make sure Python and pyserial are installed:" -ForegroundColor Red
    Write-Host "        pip install pyserial" -ForegroundColor Red
    exit 1
}

Write-Host ""
$pidValue = $bridge.Id
Write-Host "[OK] Serial bridge started (PID: $pidValue)" -ForegroundColor Green
Write-Host "[*] Saving PID to serial_bridge.pid"
$bridge.Id | Out-File -FilePath "serial_bridge.pid" -Encoding ASCII

Write-Host ""
Write-Host "Available COM ports:" -ForegroundColor Cyan
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
if ($ports.Count -eq 0) {
    Write-Host "  (No COM ports found - you may need virtual COM port software)" -ForegroundColor Yellow
} else {
    $ports | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
}

Write-Host ""
Write-Host "To test devices, run in another terminal:" -ForegroundColor Yellow
Write-Host "  python test-scripts/test_healvet_full_panel.py COM4 DOG-12345" -ForegroundColor White
Write-Host "  python test-scripts/test_pointcare.py COM6 DOG-12345" -ForegroundColor White
Write-Host "" -ForegroundColor Cyan
Write-Host "Virtual COM Port Pairs (com0com):" -ForegroundColor Cyan
Write-Host "  Healvet: COM3 (app listens) <-> COM4 (test script sends)" -ForegroundColor White
Write-Host "  Pointcare: COM5 (app listens) <-> COM6 (test script sends)" -ForegroundColor White

Write-Host ""
Write-Host "To stop the bridge later, run:" -ForegroundColor Yellow
Write-Host "  Stop-Process -Id (Get-Content serial_bridge.pid)" -ForegroundColor White

Write-Host ""
Write-Host "Press Ctrl+C to stop the bridge" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Wait for user to press Ctrl+C
try {
    Wait-Process -Id $bridge.Id
} catch {
    Write-Host ""
    Write-Host "Bridge stopped" -ForegroundColor Yellow
}
