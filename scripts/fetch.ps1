<#
.SYNOPSIS  Fetch Chromium at the pinned version (mirror of scripts/fetch.sh). UNVERIFIED on Windows.
#>
[CmdletBinding()]
param([string]$Dest)
. "$PSScriptRoot\common.ps1"
if (-not $Dest) { $Dest = Split-Path (Get-ChromiumSrc) -Parent }
Assert-OutsideRepo $Dest
$version = Get-ChromiumVersion
if (-not $env:DEPOT_TOOLS_WIN_TOOLCHAIN) { $env:DEPOT_TOOLS_WIN_TOOLCHAIN = '0' }
New-Item -ItemType Directory -Force $Dest | Out-Null
Push-Location $Dest
try {
    if (-not (Test-Path 'src')) { Invoke-Native fetch @('--nohooks', 'chromium') }
    Push-Location src
    try {
        Invoke-Native git @('fetch', '--tags', 'origin')
        Invoke-Native git @('checkout', '--detach', $version)
    } finally { Pop-Location }
    Invoke-Native gclient @('sync', '-D', '--nohooks', '--no-history', '-r', "src@$version")
    Invoke-Native gclient @('runhooks')
} finally { Pop-Location }
Write-Host "Chromium $version ready at $Dest\src"
