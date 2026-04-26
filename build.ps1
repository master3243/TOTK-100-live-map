Param(
  [string]$Name = "TOTK_Save_Map_Helper",
  [string]$Icon = "",
  [string]$ProjectDir = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ProjectDir) {
  $ProjectDir = Join-Path $scriptDir "repo"
}
$ProjectDir = (Resolve-Path $ProjectDir).Path

Write-Host "Building $Name..."
Write-Host "Project dir: $ProjectDir"
Write-Host "Working dir: $scriptDir"
Write-Host "Python:      $(Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"

$repoIndex = Join-Path $ProjectDir "index.html"
$repoStyles = Join-Path $ProjectDir "styles.css"
$repoApp = Join-Path $ProjectDir "app.js"
$repoKoroks = Join-Path $ProjectDir "korok_data.json"
$repoCompletion = Join-Path $ProjectDir "completion_data.json"
$repoServer = Join-Path $ProjectDir "server.py"
$repoConfig = Join-Path $ProjectDir "config.json"

foreach ($p in @($repoServer,$repoIndex,$repoStyles,$repoApp,$repoKoroks,$repoCompletion)) {
  if (-not (Test-Path $p)) { throw "Missing required file: $p" }
}

Push-Location $scriptDir
try {
$args = @(
  "--onefile",
  "--windowed",
  "--clean",
  "--name", $Name,
  "--distpath", $scriptDir,
  "--workpath", (Join-Path $ProjectDir ".pyinstaller-build"),
  "--specpath", $ProjectDir,
  "--add-data", "$repoIndex;.",
  "--add-data", "$repoStyles;.",
  "--add-data", "$repoApp;.",
  "--add-data", "$repoKoroks;.",
  "--add-data", "$repoCompletion;.",
  $repoServer
)

if (Test-Path $repoConfig) {
  $args = $args[0..($args.Length-2)] + @("--add-data", "$repoConfig;.", $args[-1])
}

if ($Icon -and (Test-Path $Icon)) {
  $args = @("--icon", $Icon) + $args
}

Write-Host "Running: python -m PyInstaller $($args -join ' ')"
& python -m PyInstaller @args
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$out = Join-Path $scriptDir ("{0}.exe" -f $Name)
if (-not (Test-Path $out)) {
  throw "Build finished but output not found: $out"
}

Write-Host "Done. Output is in $out"
} finally {
  Pop-Location
}

