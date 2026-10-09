---
name: passkey-authenticator
description: Implement or change Corvid passkey (WebAuthn/FIDO2) support: built-in encrypted software authenticator, OS authenticator integration, hardware keys, hybrid (phone) transport.
---

# passkey-authenticator

## Architecture
- Chromium's WebAuthn stack lives in `device/fido/` (authenticators, discovery) and `chrome/browser/webauthn/` (UI/delegate). Platform authenticators already exist upstream for Windows (Windows WebAuthn API), macOS (Touch ID), and Android (Credential Manager / Play-services-backed). Linux has no platform authenticator.
- Chrome's own Google Password Manager "enclave" authenticator must be disabled (Google dependency); do not remove its code, just gate it off (see `debrand-and-degoogle`).
- Corvid adds a **software authenticator** in `src-overlay/corvid/passkeys/`, registered as an extra discovery in the FIDO discovery factory, plus a vault UI (`add-webui-page`: `corvid://passkeys`).

## Software authenticator requirements
1. Resident/discoverable credentials, user verification, `rk`, `credProps`, `hmac-secret`/PRF where feasible, attestation "none".
2. Keys: ES256 (required), also EdDSA/RS256 where cheap. Private keys encrypted at rest with a vault key derived from a user secret (OS keyring/secret-service/DPAPI/Keystore when available, plus optional passphrase via Argon2id). Never store plaintext keys.
3. User verification: OS biometric/PIN prompt where available (Windows Hello, Touch ID, Android BiometricPrompt); on Linux use the vault passphrase or polkit/fprintd where present.
4. Hybrid transport (phone as authenticator): rely on upstream caBLE/hybrid support; confirm it works without Google cloud services (it uses a tunnel server; check which host and make it configurable or document it as a required exception in `docs/network-allowlist.md`, and ask the user).
5. Hardware security keys via HID/NFC/USB as upstream.
6. Management UI: list, rename, delete, export/import (encrypted, FIDO Alliance CXP/CXF format when stable), per-credential metadata.
7. Sync hooks defined now, implemented in Phase 4 (E2EE; credentials encrypted client-side).

## Tests
- Register and sign in on webauthn.io, a passkey test site, and at least two major relying parties; test conditional UI (autofill), cross-device flow, and hardware key.
- Unit tests for vault encryption and credential store; negative tests for tampered vault.
- Security review checklist in `docs/security/passkeys.md` before release.

## Platform notes
Windows: delegate to OS WebAuthn plus software fallback. Android: Credential Manager is primary; software vault is an option the user can choose as provider. macOS: Touch ID plus software fallback.
