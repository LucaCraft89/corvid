<#
.SYNOPSIS  Run phase acceptance checks on Windows (mirror of scripts/verify.sh). UNVERIFIED on Windows.
.DESCRIPTION
  Runs tests\acceptance\phase-N\*.ps1 in name order and writes a pass/fail table.
  Exit code 0 = PASS, 2 = SKIPPED (cannot run here; never counted as pass), other = FAIL.
  This script exits non-zero if anything failed or was skipped.
#>
[CmdletBinding()]
param([Parameter(Mandatory)][int]$Phase, [string]$Platform = 'windows', [string]$ReportDir)
. "$PSScriptRoot\common.ps1"
if (-not $ReportDir) { $ReportDir = Join-Path $script:RepoRoot 'docs\reports' }
$dir = Join-Path $script:RepoRoot "tests\acceptance\phase-$Phase"
$rows = @()
$bad = 0
foreach ($t in Get-ChildItem $dir -Filter '[0-9]*.ps1' | Sort-Object Name) {
    $log = Join-Path ([System.IO.Path]::GetTempPath()) ($t.BaseName + '.log')
    & pwsh -NoProfile -File $t.FullName *> $log
    $code = $LASTEXITCODE
    $status = switch ($code) { 0 { 'PASS' } 2 { 'SKIPPED' } default { 'FAIL' } }
    if ($status -ne 'PASS') { $bad++ }
    $rows += "| $($t.BaseName) | $status | $log |"
}
$report = Join-Path $ReportDir ("phase-$Phase-$Platform-run-$(Get-Date -Format yyyy-MM-dd).md")
$lines = @("# Phase $Phase $Platform verify run", '', '| check | status | log |', '|---|---|---|') + $rows
$lines | Set-Content $report -Encoding utf8
Write-Host "Report: $report"
exit ([int]($bad -gt 0))
