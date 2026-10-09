<#
.SYNOPSIS  Generate GN args and build Corvid on Windows (mirror of scripts/build.sh).
.EXAMPLE   .\build.ps1 -Config release -Targets chrome,mini_installer
  UNVERIFIED on Windows.
#>
[CmdletBinding()]
param([ValidateSet('release', 'debug')][string]$Config = 'release',
      [string[]]$Targets = @('chrome'), [string]$Src, [int]$Jobs = 0)
. "$PSScriptRoot\common.ps1"
if (-not $Src) { $Src = Get-ChromiumSrc }
if (-not $env:DEPOT_TOOLS_WIN_TOOLCHAIN) { $env:DEPOT_TOOLS_WIN_TOOLCHAIN = '0' }
$argsFile = Join-Path $script:RepoRoot "build\args\win-$Config.gn"
if (-not (Test-Path $argsFile)) { throw "missing $argsFile" }
$outDir = 'out\' + (Get-Culture).TextInfo.ToTitleCase($Config)
Push-Location $Src
try {
    New-Item -ItemType Directory -Force $outDir | Out-Null
    Copy-Item $argsFile (Join-Path $outDir 'args.gn') -Force
    Invoke-Native gn @('gen', $outDir)
    $ninja = @('-C', $outDir) + $Targets
    if ($Jobs -gt 0) { $ninja = @('-j', "$Jobs") + $ninja }
    Invoke-Native autoninja $ninja
} finally { Pop-Location }
Write-Host "Built [$($Targets -join ', ')] into $Src\$outDir (UNSIGNED unless package.ps1 -Sign is used)."
