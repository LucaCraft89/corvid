<#
.SYNOPSIS  Collect installer artifact, checksums, BUILDINFO, optional signed update manifest.
.DESCRIPTION
  Signing is OFF by default: output is labelled UNSIGNED. -Sign needs a user-provided certificate
  thumbprint; this script never creates or stores keys (docs/security/code-signing.md; the
  certificate/channel decision is an open question). The update manifest is produced by
  src-overlay/corvid/windows/updater/make-manifest.mjs with a user-supplied Ed25519 key file.
  UNVERIFIED on Windows.
#>
[CmdletBinding()]
param([string]$Src, [string]$OutDir = 'Release', [string]$Version,
      [switch]$Sign, [string]$CertThumbprint, [string]$TimestampUrl,
      [string]$ManifestKeyFile, [string]$ManifestBaseUrl, [string]$KeyId)
. "$PSScriptRoot\common.ps1"
if (-not $Src) { $Src = Get-ChromiumSrc }
if (-not $Version) { $Version = Get-BrandingValue 'version' }
$dest = Join-Path $script:RepoRoot "release\$Version\windows-x64"
New-Item -ItemType Directory -Force $dest | Out-Null
$build = Join-Path $Src "out\$OutDir"
$installer = Join-Path $build 'mini_installer.exe'
if (-not (Test-Path $installer)) { throw "mini_installer.exe not found in $build" }
$name = "Corvid-$Version-x64-setup.exe"
$artifact = Join-Path $dest $name
Copy-Item $installer $artifact -Force

if ($Sign) {
    if (-not $CertThumbprint -or -not $TimestampUrl) {
        throw '-Sign needs -CertThumbprint and -TimestampUrl (user-provided).'
    }
    Invoke-Native signtool @('sign', '/sha1', $CertThumbprint, '/fd', 'SHA256', '/tr', $TimestampUrl, '/td', 'SHA256', $artifact)
    Invoke-Native signtool @('verify', '/pa', '/v', $artifact)
} else {
    Set-Content (Join-Path $dest 'UNSIGNED.txt') 'This build is NOT Authenticode-signed. SmartScreen warnings are expected.'
}

$hash = (Get-FileHash $artifact -Algorithm SHA256).Hash.ToLower()
"$hash  $name" | Set-Content (Join-Path $dest 'SHA256SUMS') -Encoding ascii

$info = [ordered]@{
    version      = $Version
    platform     = 'windows-x64'
    signed       = [bool]$Sign
    chromium     = Get-ChromiumVersion
    seriesSha256 = (Get-FileHash (Join-Path $script:RepoRoot 'patches\series.phase3') -Algorithm SHA256).Hash.ToLower()
    gnArgs       = (Get-Content (Join-Path $build 'args.gn') -Raw)
    builtAtUtc   = (Get-Date).ToUniversalTime().ToString('o')
}
$info | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $dest 'BUILDINFO.json') -Encoding utf8

if ($ManifestKeyFile) {
    if (-not $ManifestBaseUrl -or -not $KeyId) { throw '-ManifestBaseUrl and -KeyId required (no default update server).' }
    $tool = Join-Path $script:RepoRoot 'src-overlay\corvid\windows\updater\make-manifest.mjs'
    Invoke-Native node @($tool, '--artifact', $artifact, '--version', $Version, '--base-url', $ManifestBaseUrl,
        '--key', $ManifestKeyFile, '--key-id', $KeyId, '--out', (Join-Path $dest 'manifest.json'))
}
Write-Host "Release folder: $dest  (signed=$([bool]$Sign))"
