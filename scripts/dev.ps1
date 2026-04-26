$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$python = if (Test-Path $venvPython) { $venvPython } else { "python" }

Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoExit", "-Command", "cd '$backend'; & '$python' -m uvicorn app.main:app --reload --port 8000"
Start-Process -WindowStyle Hidden powershell -ArgumentList "-NoExit", "-Command", "cd '$frontend'; npm run dev"

Write-Host "FairLens backend:  http://localhost:8000/api/health"
Write-Host "FairLens frontend: http://localhost:3000"
