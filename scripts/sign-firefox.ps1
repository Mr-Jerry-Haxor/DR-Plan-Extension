$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:WEB_EXT_API_KEY) -or
    [string]::IsNullOrWhiteSpace($env:WEB_EXT_API_SECRET)) {
    throw "Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET with AMO API credentials before signing."
}

$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$firefoxSource = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot "dist\firefox"))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot "dist"))

if (-not $firefoxSource.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not $distRoot.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved signing paths are outside the workspace."
}

if (-not (Test-Path -LiteralPath (Join-Path $firefoxSource "manifest.json") -PathType Leaf)) {
    throw "Build the Firefox package before signing."
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

npx --yes web-ext sign `
    --source-dir $firefoxSource `
    --artifacts-dir $distRoot `
    --channel unlisted

if ($LASTEXITCODE -ne 0) {
    throw "Mozilla signing failed with exit code $LASTEXITCODE."
}

Write-Output "Mozilla-signed XPI downloaded to $distRoot"
