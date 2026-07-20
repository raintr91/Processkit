param(
  [string]$InstallDir = "$HOME\.processkit",
  [string]$Ref = "main",
  [string]$From = $env:PROCESSKIT_SRC,
  [ValidateSet("docs", "fe", "be")]
  [string]$Type = "docs",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$BinDir = "$HOME\.local\bin"

if ($Uninstall) {
  Remove-Item "$BinDir\processkit.cmd" -Force -ErrorAction SilentlyContinue
  Remove-Item "$BinDir\processkit-mcp.cmd" -Force -ErrorAction SilentlyContinue
  Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Processkit uninstalled."
  exit 0
}

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("processkit-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $TempDir | Out-Null

if ($From) {
  $From = (Resolve-Path $From).Path
  if (-not (Test-Path (Join-Path $From "package.json"))) {
    throw "processkit: not a Processkit checkout: $From"
  }
  Write-Host "Installing Processkit from local checkout: $From"
  Copy-Item -Path (Join-Path $From "*") -Destination $TempDir -Recurse -Force
  Remove-Item (Join-Path $TempDir "node_modules") -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $TempDir "dist") -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $TempDir ".git") -Recurse -Force -ErrorAction SilentlyContinue
} else {
  git clone --depth 1 --branch $Ref "https://github.com/raintr91/Processkit.git" $TempDir
}

Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
Move-Item $TempDir $InstallDir
Push-Location $InstallDir
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  pnpm install
  pnpm build
} else {
  npm install
  npm run build
}
Pop-Location

New-Item -ItemType Directory -Force $BinDir | Out-Null
"@node `"$InstallDir\bin\processkit.mjs`" %*" |
  Set-Content "$BinDir\processkit.cmd"
"@node `"$InstallDir\bin\processkit-mcp.mjs`" %*" |
  Set-Content "$BinDir\processkit-mcp.cmd"

$Version = (Get-Content (Join-Path $InstallDir "package.json") | ConvertFrom-Json).version
Write-Host "Installed Processkit $Version -> $InstallDir"
Write-Host "Next:"
Write-Host "  processkit init   # wizard: agents -> lane (CI: --type=$Type --target=cursor --yes)"
Write-Host "Dev tip: `$env:PLATFORM_DNA_PROCESSKIT_ROOT = '$InstallDir'"
