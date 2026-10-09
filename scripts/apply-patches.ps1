<#
.SYNOPSIS  Apply the patch series (+ Windows series) and copy src-overlay into the Chromium tree.
.DESCRIPTION
  Order: patches/series (shared, owned by Phase 0), then patches/series.phase3 (Windows-only).
  Patches apply with `git apply --index --3way`; the first failure aborts and names the patch.
  -Check is a dry run against a clean tree. UNVERIFIED on Windows.
#>
[CmdletBinding()]
param([string]$Src, [switch]$Check, [switch]$SkipOverlay)
. "$PSScriptRoot\common.ps1"
if (-not $Src) { $Src = Get-ChromiumSrc }
Assert-OutsideRepo $Src

$seriesFiles = @('patches\series', 'patches\series.phase3') |
    ForEach-Object { Join-Path $script:RepoRoot $_ } | Where-Object { Test-Path $_ }
Push-Location $Src
try {
    foreach ($sf in $seriesFiles) {
        Write-Host "== series: $sf"
        foreach ($rel in Get-SeriesEntries $sf) {
            $p = Join-Path $script:RepoRoot ('patches\' + ($rel -replace '/', '\'))
            if (-not (Test-Path $p)) { throw "series entry missing on disk: $rel (in $sf)" }
            if ($Check) { & git apply --check --3way $p } else { & git apply --index --3way $p }
            if ($LASTEXITCODE -ne 0) { throw "PATCH FAILED: $rel" }
            Write-Host "ok  $rel"
        }
    }
    if (-not $SkipOverlay -and -not $Check) {
        $ov = Join-Path $script:RepoRoot 'src-overlay'
        if (Test-Path $ov) {
            # robocopy exit codes 0-7 are success.
            & robocopy $ov $Src /E /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "overlay copy failed ($LASTEXITCODE)" }
            $global:LASTEXITCODE = 0
        }
    }
} finally { Pop-Location }
