param(
  [string]$InstallDir = "$HOME\.processkit",
  [string]$Ref = "main",
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
git clone --depth 1 --branch $Ref "https://github.com/raintr91/Processkit.git" $TempDir
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

Write-Host "Installed Processkit. Next:"
Write-Host "  processkit init   # wizard: agents -> lane (CI: --type=$Type --target=cursor --yes)"
