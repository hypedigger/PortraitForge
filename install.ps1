<#
.SYNOPSIS
    Installs PortraitForge: virtual environment, dependencies, Start Menu shortcut.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install.ps1
#>
[CmdletBinding()]
param([switch] $NoShortcut)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "==> Python virtual environment" -ForegroundColor Cyan
$venv = Join-Path $root '.venv'
if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
    python -m venv $venv
}
& (Join-Path $venv 'Scripts\python.exe') -m pip install --upgrade pip -q
& (Join-Path $venv 'Scripts\pip.exe') install -r (Join-Path $root 'requirements.txt') -q
Write-Host "    dependencies installed" -ForegroundColor Green

if (-not (Test-Path (Join-Path $root 'launch_config.json'))) {
    Write-Host "==> launch_config.json not found - edit it to point at your ComfyUI install" -ForegroundColor Yellow
}

if (-not $NoShortcut) {
    Write-Host "==> Start Menu shortcut" -ForegroundColor Cyan
    $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut((Join-Path $startMenu 'PortraitForge.lnk'))
    $sc.TargetPath = 'powershell.exe'
    $sc.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\launch.ps1`""
    $sc.WorkingDirectory = $root
    $icon = Join-Path $root 'app.ico'
    if (Test-Path $icon) { $sc.IconLocation = $icon }
    $sc.Description = 'PortraitForge - restyle game portraits with Stable Diffusion'
    $sc.Save()
    Write-Host "    shortcut created" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Edit launch_config.json (ComfyUI paths), then run launch.ps1" -ForegroundColor Cyan
Write-Host "or 'python app.py' and open http://127.0.0.1:8777"
