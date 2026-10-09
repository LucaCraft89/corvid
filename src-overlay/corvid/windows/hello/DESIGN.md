# Windows Hello / OS WebAuthn integration design (task 3.6)

Status: DESIGN, UNVERIFIED. No code; depends on the Phase 2 software authenticator (`src-overlay/corvid/passkeys/`), which another agent owns.

## Facts to confirm in the pinned tree (do not trust this list blindly)
- Upstream `device/fido/win/` wraps the Windows WebAuthn API (`webauthn.dll`) and exposes it as a platform/cross-platform authenticator (`WinWebAuthnApi`, `WinNativeCrossPlatformAuthenticator`, plugin authenticator support in newer Windows 11 builds). Windows 11 (23H2+) lets the OS passkey UI route to plugin authenticators.
- Chrome gates the OS path behind `webauthn` features/flags and `enable_webauthn` build args; confirm names with `gn args --list`.

## Decisions (consistent with locked "OS authenticators + built-in software authenticator")
1. Default: delegate to the Windows WebAuthn API for platform (Windows Hello: face/fingerprint/PIN) and hardware keys. Corvid adds no new UI for this; the OS dialog is shown.
2. Software authenticator remains available as an explicit user choice: if Hello is unavailable (`WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable` false, no TPM/PIN), or the user selects "Corvid vault" in the passkey chooser.
3. Provider selection: per-origin chooser remembers last choice; setting `passkeys.provider = auto|windows|corvid`. `auto` = Windows if available else Corvid.
4. Gate off the Google Password Manager enclave authenticator (patch 0004, per `passkey-authenticator` skill); do not delete code.
5. User verification for the software vault on Windows: prompt through `UserConsentVerifier` (Windows Hello) to unlock the vault key stored with DPAPI (`CryptProtectData`, user scope) in addition to the optional Argon2id passphrase. Failure to verify never falls back to unauthenticated release of keys.
6. Optional later (not Phase 3): register the Corvid vault as a Windows 11 plugin authenticator so other apps can use it; needs a separate security review.

## Failure behavior
Hello cancelled => WebAuthn `NotAllowedError`, no silent fallback to the software authenticator (avoid surprising credential creation in the wrong store). Hello unavailable => chooser shows only Corvid vault + hardware key.

## Tests (UNVERIFIED, need Win10 + Win11 VMs with virtual TPM and a PIN-only Hello)
Register/sign-in on webauthn.io with (a) Hello PIN, (b) software authenticator, (c) hardware key; conditional UI autofill; cancel path; Hello unavailable path. Scripted checks live in `tests/acceptance/phase-3/04-passkeys.ps1` (manual-assisted).

## Security review items
DPAPI scope and roaming; vault key never logged; downgrade from `windows` to `corvid` requires explicit user action; credential-store separation (Hello credentials never exported by Corvid).
