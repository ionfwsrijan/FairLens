$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$python = Join-Path $root ".venv\Scripts\python.exe"
$nodeNpm = "C:\Program Files\nodejs\npm.cmd"
$npm = if (Test-Path $nodeNpm) { $nodeNpm } else { "npm" }

Set-Location $root

if (!(Test-Path $python)) {
  Write-Host "Creating Python virtual environment..."
  python -m venv .venv
}

Write-Host "Installing backend dependencies..."
& $python -m pip install -r backend\requirements.txt

Write-Host "Installing frontend dependencies..."
Set-Location $frontend
& $npm install --legacy-peer-deps

Write-Host "FairLens setup complete."
Write-Host "Backend:  .\scripts\run_backend.ps1"
Write-Host "Frontend: .\scripts\run_frontend.ps1"
