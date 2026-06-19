# =============================================================
# daily-run.ps1 - corrida diaria: genera y sube 3 shorts + 1 video largo.
# Pensado para Windows Task Scheduler.
#
# Uso manual:
#   powershell -ExecutionPolicy Bypass -File scripts\daily-run.ps1 -NoUpload
#   powershell -ExecutionPolicy Bypass -File scripts\daily-run.ps1 -OnlyShorts -NoUpload
# =============================================================

param(
  [string]$Channel = "",
  [switch]$NoUpload = $false,
  [switch]$NoPull = $false,
  [switch]$NoSchedule = $false,
  [switch]$OnlyShorts = $false,
  [switch]$OnlyLong = $false
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$LogDir = Join-Path $Root "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$Stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$LogFile = Join-Path $LogDir ("run_" + $Stamp + ".log")

function Log { param([string]$m)
  $line = "[" + (Get-Date -Format "HH:mm:ss") + "] " + $m
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}
function Stream { process {
  Write-Host $_
  try { Add-Content -Path $LogFile -Value ([string]$_) -Encoding UTF8 -ErrorAction Stop } catch {}
}}

Log "=== daily-run start ==="

# matar huerfanos de corridas previas (ffmpeg/node colgados)
$z = Get-Process node, ffmpeg -ErrorAction SilentlyContinue
if ($z) { Log ("matando " + ($z|Measure-Object).Count + " huerfanos"); $z | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep 2 }

if (-not $NoPull) {
  Log "git pull"
  & git pull origin main 2>&1 | Stream
  $changed = & git diff HEAD@{1} HEAD --name-only 2>$null
  if ($changed -match "package(-lock)?\.json") { Log "npm install"; & npm install 2>&1 | Stream }
}

$nodeArgs = @("src\run.js")
if ($Channel -ne "") { $nodeArgs += $Channel }
if (-not $NoUpload)  { $nodeArgs += "--upload" }
if ($NoSchedule)     { $nodeArgs += "--no-schedule" }
if ($OnlyShorts)     { $nodeArgs += "--only-shorts" }
if ($OnlyLong)       { $nodeArgs += "--only-long" }

Log ("node " + ($nodeArgs -join " "))
& node @nodeArgs 2>&1 | Stream
$code = $LASTEXITCODE
Log ("=== daily-run end (exit " + $code + ") ===")
exit $code
