# =============================================================
# post-comments.ps1 - pasa liviano que postea los comentarios pendientes
# de los videos que ya se publicaron. Lo corre la tarea "YoutubeIA-Comments"
# cada 2 horas. No genera videos ni gasta credito de Claude.
#
# Uso manual:
#   powershell -ExecutionPolicy Bypass -File scripts\post-comments.ps1
# =============================================================

param([string]$Channel = "")

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$LogDir = Join-Path $Root "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
# un log por dia (la tarea corre 12 veces/dia, no queremos 12 archivos)
$LogFile = Join-Path $LogDir ("comments_" + (Get-Date -Format "yyyy-MM-dd") + ".log")

function Write-Log {
  process {
    $line = "[" + (Get-Date -Format "HH:mm:ss") + "] " + $_
    Write-Host $line
    try { Add-Content -Path $LogFile -Value ([string]$line) -Encoding UTF8 -ErrorAction Stop } catch {}
  }
}

"--- post-comments start ---" | Write-Log

$nodeArgs = @("src\post-comments.js")
if ($Channel -ne "") { $nodeArgs += $Channel }

& node @nodeArgs 2>&1 | Write-Log

"--- post-comments end (exit $LASTEXITCODE) ---" | Write-Log
exit $LASTEXITCODE
