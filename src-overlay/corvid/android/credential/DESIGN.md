# Android passkeys: Credential Manager + Corvid vault provider (design, UNVERIFIED)

Scope: Phase 5 task 5.11. Two separate roles; do not conflate them.

## Role 1: Corvid as a WebAuthn CLIENT (web pages call navigator.credentials)
Goal: use the OS credential selector (Android Credential Manager) as the primary path.
- Android 14+ (API 34): platform `android.credentials.CredentialManager` (framework, no Google Play services needed for the API itself;
  the user's chosen providers appear in the system sheet).
- Android 9-13: the Jetpack client backport depends on Google Play services. That conflicts with the zero-Google decision.
  PROPOSAL: below API 34 use the Corvid vault + hardware keys + hybrid only, and say so in settings. Recorded as CR-A7.
- UNVERIFIED and critical: upstream Chromium's Android WebAuthn path is believed to call Play-services FIDO2/Credential Manager
  APIs (`components/webauthn/android`, `chrome/browser/webauthn/android`). It must be re-checked in the pinned tree. The
  patch `0010-webauthn-credential-manager-no-gms` is expected to swap the GMS-backed bridge for a platform-API one. Size unknown: a
  spike is needed before committing to 5.11 scope.
- Software authenticator (Phase 2, `src-overlay/corvid/passkeys/`) is registered as an additional discovery; on Android it is
  offered inside Corvid's own prompt as "Corvid vault" when the user selected it as default (setting).

## Role 2: Corvid vault as a Credential Manager PROVIDER (other apps and sites in other browsers can use Corvid-stored passkeys)
- API 34+ only: `android.service.credentials.CredentialProviderService` (Jetpack: `androidx.credentials.provider.CredentialProviderService`, in the `androidx.credentials` library; UNVERIFIED: check Jetpack licence (Apache-2.0) and that Chromium's third_party/android_deps allows it).
- Manifest (to place in the overlay manifest fragment):
  - `<service android:name=".CorvidCredentialProviderService" android:exported="true" android:permission="android.permission.BIND_CREDENTIAL_PROVIDER_SERVICE">` with intent filter `android.service.credentials.CredentialProviderService`, and `<meta-data android:name="android.credentials.provider" android:resource="@xml/corvid_provider">` declaring `capabilities` (`android.credentials.TYPE_PUBLIC_KEY_CREDENTIAL`, optionally password).
  - A settings activity, `android.credentials.CredentialProviderService.SERVICE_INTERFACE` settings intent, so the user can enable Corvid under "Passwords, passkeys & accounts".
- Service callbacks (names per Jetpack provider API; verify): `onBeginGetCredentialRequest`, `onBeginCreateCredentialRequest`, `onClearCredentialStateRequest`. Return entries as `PublicKeyCredentialEntry` / `CreateEntry` with PendingIntents to a Corvid activity.
- The PendingIntent activity shows `BiometricPrompt` (user verification), signs/creates using the vault, returns via `PendingIntentHandler.setGetCredentialResponse/setCreateCredentialResponse`.
- Vault access: reuse the Phase 2 vault library (native C++ or via a small JNI wrapper). Keys stay encrypted at rest; the vault key is wrapped by an Android Keystore key requiring user authentication (StrongBox if present). Never export private keys through the provider API.
- Origin/privileged-caller handling: the provider receives `CallingAppInfo`; for browser callers the privileged-app allowlist applies. Corvid as a *caller* needs to be on the provider's allowlist (Google Password Manager ships one; other providers keep their own). Corvid's own vault accepting only its own client plus allowlisted browsers is the safe default. UNVERIFIED API details.
- Hybrid/phone-as-authenticator: unaffected; follows CR-5.

## Files here
- `CorvidCredentialProviderService.kt`: skeleton only (UNVERIFIED, not compiled).

## Tests (all UNVERIFIED, need API 34+ device)
Enable Corvid in system provider settings; register on webauthn.io in Corvid with Credential Manager, then with vault; sign in on two major sites; cross-app: use Corvid-stored passkey from another browser. Negative: tampered vault, biometrics cancelled, allowlist mismatch.
