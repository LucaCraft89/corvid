# Acceptance 3: changing Windows light/dark (and accent) updates Corvid live within 1 s.
# Needs a running Corvid plus a theme debug endpoint (to be provided by the Phase 1 theme engine;
# the URL below is a PLACEHOLDER, not an existing API). Otherwise SKIPPED.
. "$PSScriptRoot\_lib.ps1"
Require-Windows
if (-not $env:CORVID_DEBUG_PORT) { Skip 'set CORVID_DEBUG_PORT of a running Corvid (needs theme debug hook)' }
$pers = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$orig = (Get-ItemProperty $pers).AppsUseLightTheme
function Get-CorvidMode {
    (Invoke-RestMethod "http://127.0.0.1:$($env:CORVID_DEBUG_PORT)/corvid/theme-scheme").mode
}
try {
    $want = if ($orig -eq 1) { 0 } else { 1 }
    $expect = if ($want -eq 0) { 'dark' } else { 'light' }
    Set-ItemProperty $pers AppsUseLightTheme $want
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $ok = $false
    while ($sw.ElapsedMilliseconds -lt 1000) {
        if ((Get-CorvidMode) -eq $expect) { $ok = $true; break }
        Start-Sleep -Milliseconds 50
    }
    if (-not $ok) { Fail 'mode did not update within 1 s' }
} finally {
    Set-ItemProperty $pers AppsUseLightTheme $orig
}
Skip 'light/dark step passed; accent step is manual (Settings > Personalization > Colors) - not counted as pass'
