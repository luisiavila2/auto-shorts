# =============================================================
# reset-state.ps1 - borra el state (arcos + historial de videos) para
# arrancar de cero con un canal. Util cuando cambia el modelo de
# planificacion o queres descartar arcos viejos.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\reset-state.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\reset-state.ps1 -Channel chatsdramas
#   powershell -ExecutionPolicy Bypass -File scripts\reset-state.ps1 -KeepOutput
#
# Por defecto borra:
#   - state\<channel>.json        (historial de videos)
#   - state\<channel>_arcs.json   (arcos narrativos)
#   - output\<channel>_*\         (videos generados)
# =============================================================

param(
  [string]$Channel = "chatsdramas",
  [switch]$KeepOutput = $false
)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$stateFile   = Join-Path $Root "state\$Channel.json"
$arcsFile    = Join-Path $Root "state\${Channel}_arcs.json"
$avatarsDir  = Join-Path $Root "state\$Channel"

Write-Host ""
Write-Host "Reset state para canal: $Channel" -ForegroundColor Cyan
Write-Host "  state file: $stateFile"
Write-Host "  arcs file:  $arcsFile"
if (-not $KeepOutput) { Write-Host "  output dir: output\${Channel}_*" }
Write-Host ""

$confirm = Read-Host "Confirmar? (s/N)"
if ($confirm -ne "s" -and $confirm -ne "S") {
  Write-Host "Cancelado." -ForegroundColor Yellow
  exit 0
}

# Matar procesos hijos huerfanos que pueden estar bloqueando archivos
# (node colgado, ffmpeg de un render abortado, chrome headless de playwright)
Write-Host "Cerrando procesos huerfanos..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.Name -match "^(node|ffmpeg|chrome|chrome_headless_shell)$" } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

if (Test-Path $stateFile) {
  Remove-Item $stateFile -Force
  Write-Host "  borrado: $stateFile" -ForegroundColor Green
}
if (Test-Path $arcsFile) {
  Remove-Item $arcsFile -Force
  Write-Host "  borrado: $arcsFile" -ForegroundColor Green
}
if (Test-Path $avatarsDir) {
  Remove-Item $avatarsDir -Recurse -Force
  Write-Host "  borrado: $avatarsDir (avatars)" -ForegroundColor Green
}

if (-not $KeepOutput) {
  $outputs = Get-ChildItem -Path (Join-Path $Root "output") -Directory -Filter "${Channel}_*" -ErrorAction SilentlyContinue
  foreach ($d in $outputs) {
    Remove-Item $d.FullName -Recurse -Force
    Write-Host "  borrado: $($d.FullName)" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Listo. La proxima corrida generara un arco nuevo Ep 1." -ForegroundColor Green
