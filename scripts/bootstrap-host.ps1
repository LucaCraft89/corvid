<#
.SYNOPSIS  Prepare a Windows 10/11 x64 host to build Corvid (skill: bootstrap-build-host).
.DESCRIPTION
  Checks RAM/disk/long paths; changes system state only when an explicit switch is passed.
  Verify required Visual Studio components against Chromium's CURRENT Windows build doc first.
  UNVERIFIED: not executed on Windows.
#>
[CmdletBinding()]
param([switch]$ApplyLongPaths, [switch]$AddDefenderExclusions, [string]$Checkout)
. "$PSScriptRoot\common.ps1"

$probe = if ($Checkout) { $Checkout } else { $env:USERPROFILE }
$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$drive = (Get-Item $probe).PSDrive
$freeGB = [math]::Round($drive.Free / 1GB)
Write-Host "RAM: $ramGB GB (need >=32, 64 recommended); free disk: $freeGB GB (need >=150)"
if ($ramGB -lt 32 -or $freeGB -lt 150) {
    Write-Warning 'Below minimum sizing; lower autoninja -j before assuming failures.'
}

$lpKey = 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem'
$lp = (Get-ItemProperty $lpKey -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
if ($lp -ne 1) {
    if ($ApplyLongPaths) {
        Set-ItemProperty $lpKey -Name LongPathsEnabled -Value 1 -Type DWord
        Write-Host 'LongPathsEnabled set (reboot may be required).'
    } else {
        Write-Warning 'Long paths disabled. Re-run with -ApplyLongPaths (admin).'
    }
}

foreach ($t in 'git', 'python', 'node') {
    if (-not (Get-Command $t -ErrorAction SilentlyContinue)) { Write-Warning "Missing tool: $t" }
}
if (-not (Get-Command gclient -ErrorAction SilentlyContinue)) {
    Write-Warning 'depot_tools not on PATH. Clone chromium/tools/depot_tools to C:\depot_tools and prepend to PATH.'
}
if ($AddDefenderExclusions) {
    if (-not $Checkout) { throw '-AddDefenderExclusions needs -Checkout.' }
    Add-MpPreference -ExclusionPath $Checkout
    Write-Host "Defender exclusion added: $Checkout"
}
Write-Host 'Set DEPOT_TOOLS_WIN_TOOLCHAIN=0 when using a local Visual Studio install.'
Write-Host 'Record measured sizing/build times in docs/build-host.md.'
