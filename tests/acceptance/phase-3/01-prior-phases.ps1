# Acceptance 1: Phase 1 and 2 suites pass on Windows. Delegates to their verify runs.
. "$PSScriptRoot\_lib.ps1"
Require-Windows
$verify = Join-Path $PSScriptRoot '..\..\..\scripts\verify.ps1'
foreach ($p in 1, 2) {
    if (-not (Test-Path (Join-Path $PSScriptRoot "..\phase-$p"))) { Skip "tests/acceptance/phase-$p not present in this checkout" }
    & pwsh -NoProfile -File $verify -Phase $p -Platform windows
    if ($LASTEXITCODE -ne 0) { Fail "phase $p suite did not fully pass (failures or skips)" }
}
Pass 'phase 1 and 2 suites passed'
