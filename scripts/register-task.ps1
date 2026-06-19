# =============================================================
# register-task.ps1 - registra daily-run.ps1 en Windows Task Scheduler.
#
# Por defecto: corre todos los dias a las 09:00 hora del servidor.
# Cambia la hora con -Hour y -Minute.
#
# Correr UNA VEZ desde PowerShell elevado (Administrador):
#   powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
#
# Para borrar la tarea:
#   powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1 -Remove
#
# Para ver si esta activa:
#   Get-ScheduledTask -TaskName "AutoShorts-Daily"
# =============================================================

param(
  [int]$Hour = 9,
  [int]$Minute = 0,
  [switch]$Remove = $false,
  [string]$TaskName = "AutoShorts-Daily"
)

# Verificar elevacion
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "ERROR: hay que correr esto como Administrador." -ForegroundColor Red
  Write-Host "Abri PowerShell con 'Ejecutar como administrador' y reintenta." -ForegroundColor Yellow
  exit 1
}

$CommentsTaskName = "AutoShorts-Comments"

# Borrar si pidieron eso (ambas tareas)
if ($Remove) {
  foreach ($tn in @($TaskName, $CommentsTaskName)) {
    if (Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $tn -Confirm:$false
      Write-Host "Tarea '$tn' eliminada." -ForegroundColor Green
    } else {
      Write-Host "No habia tarea '$tn' registrada." -ForegroundColor Yellow
    }
  }
  exit 0
}

# Rutas
$Root = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $Root "scripts\daily-run.ps1"
$CommentsScript = Join-Path $Root "scripts\post-comments.ps1"
if (-not (Test-Path $Script)) {
  Write-Host "ERROR: no encontre $Script" -ForegroundColor Red
  exit 1
}

# Si ya existen, borrarlas y reescribir
foreach ($tn in @($TaskName, $CommentsTaskName)) {
  if (Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue) {
    Write-Host "Tarea '$tn' ya existia - reemplazando..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $tn -Confirm:$false
  }
}

# Accion: corre powershell con bypass de policy
$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`"" `
  -WorkingDirectory $Root

# Trigger: todos los dias a la hora pedida
$Trigger = New-ScheduledTaskTrigger -Daily -At ("{0:00}:{1:00}" -f $Hour, $Minute)

# Settings: si falla reintenta, no se detiene por bateria (no aplica en server pero suma),
# y permitir correr aunque el usuario no este logueado
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 15) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 8)

# Principal: correr como el usuario actual con privilegios maximos
$Principal = New-ScheduledTaskPrincipal `
  -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType S4U `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description "Genera y sube 3 shorts + 1 video largo de sabiduria." | Out-Null

# ── Tarea 2: postear comentarios cada 2h ──────────────────────────────────────
# Liviana (solo consulta YouTube y postea). Va recogiendo los videos que se
# publican a lo largo del dia y les pone su comentario.
$CommentsAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$CommentsScript`"" `
  -WorkingDirectory $Root

# Trigger: cada 2h, todo el dia, arrancando a las 10:00 (1h despues del daily)
$CommentsTrigger = New-ScheduledTaskTrigger -Daily -At "10:00"
$CommentsTrigger.Repetition = (New-ScheduledTaskTrigger -Once -At "10:00" `
  -RepetitionInterval (New-TimeSpan -Hours 2) `
  -RepetitionDuration (New-TimeSpan -Hours 13)).Repetition

$CommentsSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

Register-ScheduledTask `
  -TaskName $CommentsTaskName `
  -Action $CommentsAction `
  -Trigger $CommentsTrigger `
  -Settings $CommentsSettings `
  -Principal $Principal `
  -Description "Postea los comentarios de los Shorts a medida que se publican." | Out-Null

Write-Host ""
Write-Host "OK - tareas registradas:" -ForegroundColor Green
Write-Host ("  $TaskName       -> todos los dias {0:00}:{1:00} (genera y sube 7 videos)" -f $Hour, $Minute) -ForegroundColor Green
Write-Host "  $CommentsTaskName -> cada 2h de 10:00 a 23:00 (postea comentarios)" -ForegroundColor Green
Write-Host ""
Write-Host "Comandos utiles:" -ForegroundColor Cyan
Write-Host "  Ver estado:  Get-ScheduledTask -TaskName $TaskName"
Write-Host "  Forzar run:  Start-ScheduledTask -TaskName $TaskName"
Write-Host "  Ver logs:    Get-ChildItem logs\ | Sort LastWriteTime -Descending | Select -First 5"
Write-Host "  Quitar:      powershell -File scripts\register-task.ps1 -Remove"
