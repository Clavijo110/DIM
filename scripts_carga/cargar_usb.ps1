# Carga por cable USB el firmware del dispensador (no necesita Wi-Fi).
# Uso: cargar_usb.ps1            -> detecta el puerto solo
#      cargar_usb.ps1 -Port COM7 -> fuerza un puerto
param([string]$Port = "")

$t = "C:\Users\sgira\AppData\Local\Temp\claude"
$env:REQUESTS_CA_BUNDLE = "$t\ca-all.pem"

Write-Host "Puertos detectados:"
Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\(COM\d+\)' -and $_.Name -notmatch 'Bluetooth' } |
  ForEach-Object { Write-Host "  $($_.Name)" }

$pioArgs = @("$t\pio_wrap.py", "run", "-d", "$t\dimfw", "-e", "esp32-s3-devkitc-1", "-t", "upload")
if ($Port) { $pioArgs += @("--upload-port", $Port) }
& "$t\pio-venv\Scripts\python.exe" @pioArgs
if ($LASTEXITCODE -eq 0) { Write-Host "`nListo: firmware cargado por USB." }
else { Write-Host "`nFallo la carga. Pon la placa en modo descarga (BOOT + RESET) e intenta de nuevo." }

