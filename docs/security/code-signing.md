# Windows code signing plan (task 3.8)

Status: OPTIONS ONLY. The user has not chosen a certificate or distribution channel. Nothing here generates or stores keys. Until a decision, all builds are produced unsigned and labelled (`UNSIGNED.txt`, `BUILDINFO.json signed:false`).

## Questions for the user (blocking 3.8)
1. Which signing option below (or none for early alpha)?
2. Distribution channel: direct installer download, winget, Microsoft Store, other? (This decides the signature type needed and whether our updater is used at all.)
3. Who holds the key/HSM/cloud account, and which CI may sign?
4. Windows arm64 in Phase 3? (Needs an arm64 build, installer, and `windows-arm64` manifests; not decided here.)

## Options
| Option | What it is | Pros | Cons |
|---|---|---|---|
| A. OV code-signing cert (HSM/token or cloud HSM; CA/B Forum rules require hardware-protected keys) | Classic Authenticode | Cheap-ish; works with signtool | SmartScreen reputation builds slowly; key custody burden |
| B. EV code-signing cert | Same, extended validation | Faster SmartScreen trust (policy has changed over time; verify current behavior) | Cost, organization identity vetting, hardware token |
| C. Cloud signing service (Microsoft Artifact Signing, formerly Trusted Signing, or a CA's cloud HSM) | Short-lived certs, managed keys | No local key custody, CI-friendly | Eligibility/region/identity-validation limits; vendor dependence; verify availability |
| D. Store (MSIX) | Microsoft signs | No SmartScreen friction | Different packaging, Store policies, conflicts with own updater/Chromium sandbox model; likely poor fit |
| E. Unsigned (alpha only) | None | Free | SmartScreen blocks/warns; unacceptable beyond testers |

winget accepts unsigned installers by hash but SmartScreen still applies at run time; verify current winget policy before relying on it.

## Constraints regardless of option
- Private keys never in the repo, never on general CI runners; signing step isolated (`scripts/package.ps1 -Sign -CertThumbprint -TimestampUrl`, requires user-provided values).
- Always RFC 3161 timestamp (SHA-256) so signatures outlive the cert.
- Sign `chrome.exe`, `corvid_updater.exe`, `setup.exe`/mini_installer, DLLs; verify with `signtool verify /pa`.
- Update manifest signing (Ed25519, `docs/specs/updater.md`) is a separate key and the primary update trust root; Authenticode is defense in depth.
- Record signer identity in `BUILDINFO.json`; publish the Ed25519 public key fingerprint with each release.
- Reproducibility note: signing happens after build; unsigned hash recorded alongside.
