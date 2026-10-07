# Lanceur PortraitForge : demarre ComfyUI + l'app si besoin, puis ouvre le navigateur.
# Toute la config (chemins, ports, arguments ComfyUI) est dans launch_config.json.
$ErrorActionPreference = 'SilentlyContinue'
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$cfg = Get-Content (Join-Path $appDir 'launch_config.json') -Raw -Encoding utf8 | ConvertFrom-Json
$py = [Environment]::ExpandEnvironmentVariables($cfg.python)
$comfyMain = [Environment]::ExpandEnvironmentVariables($cfg.comfy_main)
$comfyArgs = @("`"$comfyMain`"", '--port', "$($cfg.comfy_port)")
foreach ($a in $cfg.comfy_args) { $comfyArgs += "`"$([Environment]::ExpandEnvironmentVariables($a))`"" }

function PortUp($port) {
    $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (PortUp $cfg.comfy_port)) {
    Start-Process -FilePath $py -WindowStyle Hidden `
        -WorkingDirectory (Split-Path -Parent $comfyMain) -ArgumentList $comfyArgs
}

if (-not (PortUp $cfg.app_port)) {
    Start-Process -FilePath $py -WindowStyle Hidden -WorkingDirectory $appDir -ArgumentList 'app.py'
}

$tries = 0
while (-not (PortUp $cfg.app_port) -and $tries -lt 30) { Start-Sleep 1; $tries++ }
Start-Process "http://127.0.0.1:$($cfg.app_port)"
