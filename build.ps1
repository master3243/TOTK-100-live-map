Param(
  [string]$Name = "TOTK_Save_Map_Helper",
  [string]$Icon = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Building $Name..."
Write-Host "Working dir: $(Get-Location)"
Write-Host "Python:      $(Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"

$args = @(
  "--onefile",
  "--windowed",
  "--clean",
  "--name", $Name,
  "--add-data", "index.html;.",
  "--add-data", "styles.css;.",
  "--add-data", "app.js;.",
  "--add-data", "korok_data.json;.",
  "--add-data", "completion_data.json;.",
  "server.py"
)

if ($Icon -and (Test-Path $Icon)) {
  $args = @("--icon", $Icon) + $args
}

Write-Host "Running: python -m PyInstaller $($args -join ' ')"
& python -m PyInstaller @args
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$out = Join-Path (Get-Location) ("dist\{0}.exe" -f $Name)
if (-not (Test-Path $out)) {
  throw "Build finished but output not found: $out"
}

Write-Host "Done. Output is in $out"

