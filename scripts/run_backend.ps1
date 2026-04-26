$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$python = Join-Path $root ".venv\Scripts\python.exe"

if (!(Test-Path $python)) {
  Write-Host "Creating virtual environment..."
  python -m venv (Join-Path $root ".venv")
}

Write-Host "Starting FairLens backend on http://127.0.0.1:8000"
Set-Location $backend
& $python -m uvicorn app.main:app --reload --port 8000 --http h11
