# Helpers for Phase 3 acceptance scripts. UNVERIFIED on Windows.
# Exit codes: 0 PASS, 1 FAIL, 2 SKIPPED (precondition missing; NEVER reported as pass).
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Skip([string]$Why) { Write-Host "SKIPPED: $Why"; exit 2 }
function Fail([string]$Why) { Write-Host "FAIL: $Why"; exit 1 }
function Pass([string]$Msg) { Write-Host "PASS: $Msg"; exit 0 }
function Require-Windows {
    if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) { Skip 'not running on Windows' }
}
function Get-InstallerPath {
    if ($env:CORVID_INSTALLER) { return $env:CORVID_INSTALLER }
    Skip 'set CORVID_INSTALLER to the setup exe under test'
}
