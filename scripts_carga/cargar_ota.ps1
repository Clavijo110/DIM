# Carga por OTA el firmware ya compilado al dispensador (red Wi-Fi "Dispensador").
param([string]$Ip = "192.168.4.1")

$t        = "C:\Users\sgira\AppData\Local\Temp\claude"
$python   = "$t\pio-venv\Scripts\python.exe"
$espota   = "$env:USERPROFILE\.platformio\packages\framework-arduinoespressif32\tools\espota.py"
$firmware = "$t\dimfw\.pio\build\esp32-s3-devkitc-1\firmware.bin"
$secrets  = "$t\dimfw\include\DeviceSecrets.h"

$match = Select-String -Path $secrets -Pattern 'OTA_PASSWORD\[\]\s*=\s*"([^"]*)"'
if (-not $match) { Write-Error "No encontre OTA_PASSWORD en DeviceSecrets.h"; exit 1 }
$password = $match.Matches[0].Groups[1].Value

# El firmware actual reintenta conectarse al hotspot cada 15 s y eso corta el AP;
# si la carga se interrumpe, se reintenta hasta 6 veces.
for ($intento = 1; $intento -le 6; $intento++) {
  Write-Host "Intento $intento de 6: cargando firmware a $Ip ..."
  & $python $espota -i $Ip -p 3232 --auth=$password -f $firmware -r
  if ($LASTEXITCODE -eq 0) { Write-Host "`nListo: firmware cargado. El ESP32 se reinicia solo."; exit 0 }
  Write-Host "`nSe corto la carga, reintentando en 3 s..."
  Start-Sleep 3
}
Write-Host "`nNo se pudo cargar despues de 6 intentos."
exit 1
