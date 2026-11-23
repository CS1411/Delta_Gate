# Reset Delta Gate to the demo start state in one command: empty managed store, empty database
# and audit log, golden\dues_v2.xlsx registered as workbook 'dues'.
# Usage:  powershell -File scripts\demo_reset.ps1
# Quit Claude Desktop (or disable its delta-gate server) first: a running server holds the database open.
# data\libreoffice_profile is kept (recreating it costs about 9 s on the first commit).
# The signing key is deleted with the log it signed; a new one is generated on first use.
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$targets = @(Join-Path $root 'store')
if (Test-Path (Join-Path $root 'data')) {
    $targets += Get-ChildItem (Join-Path $root 'data') -Force | Where-Object Name -ne 'libreoffice_profile' | ForEach-Object FullName
}
foreach ($target in $targets) {
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
}

Push-Location (Join-Path $root 'backend')
try {
    uv run python -m deltagate.cli register ..\golden\dues_v2.xlsx --id dues
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
finally { Pop-Location }
Write-Output 'Delta Gate is at the demo start state.'
