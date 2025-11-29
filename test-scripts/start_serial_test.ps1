# Serial Port Test Setup Script (Windows)
# This starts the Python serial bridge for testing medical devices

Write-Host "🚀 Starting Serial Port Test Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Kill any existing Python serial bridge processes
Get-Process python -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*serial_bridge.py*"
} | Stop-Process -Force

Write-Host ""
Write-Host "📡 Starting Python serial bridge..." -ForegroundColor Yellow

# Start the Python bridge in background
$bridge = Start-Process python -ArgumentList "test-scripts/serial_bridge.py" -PassThru -NoNewWindow

# Wait for bridge to initialize
Start-Sleep -Seconds 2

if ($bridge.HasExited) {
    Write-Host "❌ Serial bridge failed to start" -ForegroundColor Red
    Write-Host "   Make sure Python and pyserial are installed:" -ForegroundColor Red
    Write-Host "   pip install pyserial" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Serial bridge started (PID: $($bridge.Id))" -ForegroundColor Green
Write-Host "📝 Saving PID to serial_bridge.pid"
$bridge.Id | Out-File -FilePath "serial_bridge.pid" -Encoding ASCII

Write-Host ""
Write-Host "Available COM ports:" -ForegroundColor Cyan
[System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }

Write-Host ""
Write-Host "To test devices, run in another terminal:" -ForegroundColor Yellow
Write-Host "  python test-scripts/test_healvet_full_panel.py COM3 DOG-12345" -ForegroundColor White
Write-Host "  python test-scripts/test_pointcare.py COM4 DOG-12345" -ForegroundColor White

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
