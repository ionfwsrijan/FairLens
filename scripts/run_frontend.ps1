$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$npm = "npm"
$nodeNpm = "C:\Program Files\nodejs\npm.cmd"
if (Test-Path $nodeNpm) {
  $npm = $nodeNpm
}

Write-Host "Starting FairLens frontend on http://localhost:3000"
Set-Location $frontend
& $npm run dev
