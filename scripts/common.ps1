# Shared helpers for Corvid PowerShell wrappers. Dot-source: . "$PSScriptRoot\common.ps1"
# UNVERIFIED: not executed on Windows in the authoring sandbox.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Get-ChromiumSrc {
    # Never inside the repo (see bootstrap-build-host pitfalls). Override with CORVID_CHROMIUM_SRC.
    if ($env:CORVID_CHROMIUM_SRC) { return $env:CORVID_CHROMIUM_SRC }
    return (Join-Path $env:USERPROFILE 'chromium\src')
}

function Get-ChromiumVersion {
    $f = Join-Path $script:RepoRoot 'scripts\CHROMIUM_VERSION'
    if (-not (Test-Path $f)) { throw "Missing $f (Phase 0 pin)." }
    return (Get-Content $f -Raw).Trim()
}

function Assert-OutsideRepo([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    if ($full.StartsWith($script:RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Chromium checkout must not live inside the Corvid repo: $full"
    }
}

function Invoke-Native {
    param([Parameter(Mandatory)][string]$File, [string[]]$Arguments = @())
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Get-SeriesEntries([string]$SeriesFile) {
    # Quilt-style: one patch path per line, '#' comments and blanks ignored.
    Get-Content $SeriesFile | ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith('#') }
}

function Get-BrandingValue([string]$Key) {
    # Minimal TOML reader for `key = "value"` lines in branding/config.toml.
    $f = Join-Path $script:RepoRoot 'branding\config.toml'
    $pattern = '^\s*' + [regex]::Escape($Key) + '\s*=\s*"([^"]*)"'
    $m = Select-String -Path $f -Pattern $pattern | Select-Object -First 1
    if (-not $m) { throw "branding key not found: $Key" }
    return $m.Matches[0].Groups[1].Value
}
