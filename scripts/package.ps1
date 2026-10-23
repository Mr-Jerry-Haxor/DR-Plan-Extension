$ErrorActionPreference = "Stop"

$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$distRoot = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot "dist"))

if (-not $distRoot.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved package paths are outside the workspace."
}

$package = Get-Content -Raw -LiteralPath (Join-Path $workspaceRoot "package.json") | ConvertFrom-Json
$version = [string]$package.version
$chromiumSource = Join-Path $distRoot "chromium"
$firefoxSource = Join-Path $distRoot "firefox"

foreach ($source in @($chromiumSource, $firefoxSource)) {
    if (-not (Test-Path -LiteralPath (Join-Path $source "manifest.json") -PathType Leaf)) {
        throw "Missing built extension manifest: $source"
    }
}

New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

$chromiumZip = Join-Path $distRoot "dr-plan-review-chromium-$version.zip"
$firefoxZip = Join-Path $distRoot "dr-plan-review-firefox-$version.zip"
$firefoxXpi = Join-Path $distRoot "dr-plan-review-firefox-$version-unsigned.xpi"

Compress-Archive -Path (Join-Path $chromiumSource "*") -DestinationPath $chromiumZip -CompressionLevel Optimal -Force
Compress-Archive -Path (Join-Path $firefoxSource "*") -DestinationPath $firefoxZip -CompressionLevel Optimal -Force

$xpiCopied = $false
for ($attempt = 1; $attempt -le 6; $attempt++) {
    try {
        Copy-Item -LiteralPath $firefoxZip -Destination $firefoxXpi -Force
        $xpiCopied = $true
        break
    }
    catch [System.IO.IOException] {
        if ($attempt -eq 6) { throw }
        Start-Sleep -Milliseconds (250 * $attempt)
    }
}
if (-not $xpiCopied) {
    throw "Unable to create the Firefox XPI."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($firefoxXpi)
try {
    $manifestEntry = $archive.Entries | Where-Object { $_.FullName -eq "manifest.json" }
    if (-not $manifestEntry) {
        throw "Generated XPI does not contain manifest.json at its root."
    }
}
finally {
    $archive.Dispose()
}

Write-Output "Created Chromium ZIP: $chromiumZip"
Write-Output "Created Firefox ZIP: $firefoxZip"
Write-Output "Created unsigned Firefox XPI: $firefoxXpi"
Write-Warning "Release and Beta Firefox require a Mozilla-signed XPI. Run npm run sign:firefox after configuring AMO API credentials."
