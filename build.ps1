Param(
  [string]$Name = "TOTK_Save_Map_Helper",
  [string]$Icon = "",
  [string]$ProjectDir = "",
  [switch]$Console
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ProjectDir) {
  $ProjectDir = Join-Path $scriptDir "docs"
}
$ProjectDir = (Resolve-Path $ProjectDir).Path

Write-Host "Building $Name..."
Write-Host "Project dir: $ProjectDir"
Write-Host "Working dir: $scriptDir"
Write-Host "Python:      $(Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"

$outExe = Join-Path $scriptDir ("{0}.exe" -f $Name)
if (Test-Path $outExe) {
  Remove-Item -Force $outExe
}

$repoIndex = Join-Path $ProjectDir "index.html"
$repoArmorMaterials = Join-Path $ProjectDir "armor-upgrade-materials.html"
$repoStyles = Join-Path $ProjectDir "styles.css"
$repoFrontend = Join-Path $ProjectDir "frontend"
$repoCompletion = Join-Path $ProjectDir "completion_data.json"
$repoGui = Join-Path $ProjectDir "gui.py"
$repoConfig = Join-Path $ProjectDir "config.json"
$defaultIconPng = Join-Path $ProjectDir "assets\\zd-icons\\korok.png"
$iconTool = Join-Path $ProjectDir "tools\\png_to_ico.py"
$iconOut = Join-Path $ProjectDir ".pyinstaller-build\\app.ico"
$repoAssets = Join-Path $ProjectDir "assets"

$repoTools = Join-Path $ProjectDir "tools"
$repoCompletionBuilder = Join-Path $repoTools "build_completion_data.py"
if (-not (Test-Path $repoCompletionBuilder)) { throw "Missing required builder: $repoCompletionBuilder" }

Push-Location $scriptDir
try {
  Write-Host "Building completion_data.json..."
  & python $repoCompletionBuilder
  if ($LASTEXITCODE -ne 0) { throw "build_completion_data.py failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

foreach ($p in @($repoGui,$repoIndex,$repoArmorMaterials,$repoStyles,$repoFrontend,$repoCompletion)) {
  if (-not (Test-Path $p)) { throw "Missing required path: $p" }
}

if (-not $Icon -and (Test-Path $defaultIconPng)) {
  $Icon = $defaultIconPng
}

if ($Icon) {
  if (-not (Test-Path $Icon)) { throw "Icon file not found: $Icon" }
  if ($Icon.ToLower().EndsWith(".png")) {
    if (-not (Test-Path $iconTool)) { throw "Missing icon tool: $iconTool" }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $iconOut) | Out-Null
    Write-Host "Converting PNG icon to ICO..."
    & python $iconTool --input $Icon --output $iconOut
    if ($LASTEXITCODE -ne 0) { throw "Icon conversion failed (see output above)." }
    $Icon = $iconOut
  }
}
if ($Icon) {
  Write-Host "Using icon:  $Icon"
  if (-not (Test-Path $Icon)) { throw "Resolved icon missing: $Icon" }
}

Push-Location $scriptDir
try {
$args = @(
  "--noconfirm",
  "--onefile",
  "--clean",
  "--name", $Name,
  "--distpath", $scriptDir,
  "--workpath", (Join-Path $ProjectDir ".pyinstaller-build"),
  "--specpath", $ProjectDir,
  "--add-data", "$repoIndex;.",
  "--add-data", "$repoArmorMaterials;.",
  "--add-data", "$repoStyles;.",
  "--add-data", "$repoFrontend;frontend",
  "--add-data", "$repoCompletion;.",
  $repoGui
)

if (Test-Path $repoAssets) {
  $args = $args[0..($args.Length-2)] + @("--add-data", "$repoAssets;assets", $args[-1])
}

if (-not $Console) {
  $args = @("--windowed") + $args
}

if (Test-Path $repoConfig) {
  $args = $args[0..($args.Length-2)] + @("--add-data", "$repoConfig;.", $args[-1])
}

if ($Icon -and (Test-Path $Icon)) {
  $args = @("--icon", $Icon) + $args
}

if ($Icon -and (Test-Path $Icon)) {
  $args = $args[0..($args.Length-2)] + @("--add-data", "$Icon;.", $args[-1])
}

Write-Host "Running: python -m PyInstaller $($args -join ' ')"
& python -m PyInstaller @args
if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $outExe)) {
  throw "Build finished but output not found: $outExe"
}

Write-Host "Done. Output is in $outExe"
} finally {
  Pop-Location
}
