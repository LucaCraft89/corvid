# Acceptance 5: idle network capture clean, including the updater until a server is configured.
# Uses pktmon (built in) with a clean profile. Allows loopback only; review any hit by process.
. "$PSScriptRoot\_lib.ps1"
Require-Windows
$exe = Join-Path $env:LOCALAPPDATA 'Corvid\Application\chrome.exe'
if (-not (Test-Path $exe)) { Skip 'Corvid not installed' }
$etl = Join-Path $env:TEMP 'corvid-idle.etl'
$prof = Join-Path $env:TEMP ('corvid-idle-' + [guid]::NewGuid())
pktmon start --capture --pkt-size 0 --file-name $etl | Out-Null
$p = Start-Process $exe -ArgumentList "--user-data-dir=$prof", '--no-first-run', 'about:blank' -PassThru
Start-Sleep 300
$p | Stop-Process -Force
pktmon stop | Out-Null
$txt = Join-Path $env:TEMP 'corvid-idle.txt'
pktmon etl2txt $etl --out $txt | Out-Null
$ext = Select-String -Path $txt -Pattern 'IP ' | Where-Object { $_.Line -notmatch '127\.0\.0\.1|::1' }
if ($ext) {
    $ext | Select-Object -First 20 | ForEach-Object { Write-Host $_.Line }
    Fail 'non-loopback packets at idle; the capture is machine-wide, so attribute by PID before concluding'
}
Pass "no non-loopback packets at idle (capture $etl)"
