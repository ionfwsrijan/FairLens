$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"

Write-Host "Starting FairLens frontend on http://localhost:3000"
Set-Location $frontend
npm run dev
