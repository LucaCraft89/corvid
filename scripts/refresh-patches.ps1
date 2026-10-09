<#
.SYNOPSIS  Regenerate a Windows patch from the working tree (skill: add-patch). UNVERIFIED on Windows.
.EXAMPLE   .\refresh-patches.ps1 -Name 0001-win-installer-branding -Paths chrome/installer/mini_installer
#>
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][string[]]$Paths,
      [string]$Src, [string]$HeaderFile)
. "$PSScriptRoot\common.ps1"
if (-not $Src) { $Src = Get-ChromiumSrc }
if ($Name -notmatch '^\d{4}-[a-z0-9-]+$') { throw 'Name must be NNNN-slug.' }
$out = Join-Path $script:RepoRoot "patches\windows\$Name.patch"
Push-Location $Src
try {
    $diff = & git diff --binary HEAD -- @Paths
    if ($LASTEXITCODE -ne 0 -or -not $diff) { throw 'No diff produced.' }
} finally { Pop-Location }
if ($HeaderFile) {
    $header = Get-Content $HeaderFile -Raw
} else {
    $header = "Purpose: TODO`nArea: build`nFiles: $($Paths -join ', ')`nRebase risk: TODO`nOrigin: original`n`n"
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($out, $header + ($diff -join "`n") + "`n", $utf8)
$entry = "windows/$Name.patch"
$series = Join-Path $script:RepoRoot 'patches\series.phase3'
if (-not (Select-String -Path $series -SimpleMatch -Pattern $entry -Quiet)) { Add-Content $series $entry }
Write-Host "Wrote $out and registered in series.phase3. Fill in the header (add-patch skill)."
