# Acceptance 2: install, launch, default-browser registration, update, uninstall; no leftovers.
# Requires CORVID_INSTALLER (+ optionally CORVID_INSTALLER_NEXT for the update step). Run in a disposable VM.
. "$PSScriptRoot\_lib.ps1"
Require-Windows
$inst = Get-InstallerPath

function Get-Snapshot {
    $keys = foreach ($r in 'HKCU:\Software', 'HKLM:\Software', 'HKLM:\Software\WOW6432Node') {
        Get-ChildItem $r -ErrorAction SilentlyContinue | ForEach-Object Name
    }
    $dirs = foreach ($d in $env:LOCALAPPDATA, $env:ProgramFiles, $env:ProgramData, $env:APPDATA) {
        Get-ChildItem $d -Directory -ErrorAction SilentlyContinue | ForEach-Object FullName
    }
    $tasks = Get-ScheduledTask -ErrorAction SilentlyContinue | ForEach-Object TaskName
    $svc = Get-Service | ForEach-Object Name
    return @{ keys = @($keys); dirs = @($dirs); tasks = @($tasks); svc = @($svc) }
}

$before = Get-Snapshot
& $inst --do-not-launch-chrome --verbose-logging | Out-Null
$exe = Join-Path $env:LOCALAPPDATA 'Corvid\Application\chrome.exe'
if (-not (Test-Path $exe)) { Fail "chrome.exe not found at $exe after install" }
$p = Start-Process $exe -ArgumentList '--no-first-run', 'about:blank' -PassThru
Start-Sleep 8
if ($p.HasExited) { Fail 'browser exited immediately after launch' }
$reg = Get-ItemProperty 'HKCU:\Software\RegisteredApplications' -ErrorAction SilentlyContinue
if (-not $reg -or -not ($reg.PSObject.Properties.Name -match 'Corvid')) {
    Fail 'default-app registration (RegisteredApplications) missing'
}
Stop-Process $p -Force

if ($env:CORVID_INSTALLER_NEXT) {
    & $env:CORVID_INSTALLER_NEXT --do-not-launch-chrome | Out-Null
    Write-Host ('post-update version: ' + (Get-Item $exe).VersionInfo.ProductVersion)
}

$setup = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Corvid\Application') -Recurse -Filter setup.exe | Select-Object -First 1
if (-not $setup) { Fail 'setup.exe not found for uninstall' }
& $setup.FullName --uninstall --force-uninstall | Out-Null
Start-Sleep 3

$after = Get-Snapshot
$left = foreach ($k in 'keys', 'dirs', 'tasks', 'svc') {
    Compare-Object $before[$k] $after[$k] | Where-Object SideIndicator -eq '=>' |
        Where-Object { $_.InputObject -notmatch 'User Data' } |
        ForEach-Object { "$k : $($_.InputObject)" }
}
if ($left) {
    $left | ForEach-Object { Write-Host "LEFTOVER $_" }
    Fail 'leftovers after uninstall'
}
Pass 'install/launch/default-registration/update/uninstall clean'
