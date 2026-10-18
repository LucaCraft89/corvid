# Passkey adapter: symbols to verify on first compile (Chromium 155.0.8059.39)

Written 2026-10-18 from `docs/notes/fido-api-155.md`. The note reproduces FidoAuthenticator, FidoDiscoveryBase, the factory,
the Ctap request/response types and the status enums. The items below are NOT in the note and were written from memory.
Grep each on the tree; fix `software_authenticator.{h,cc}` to match; report anything that does not exist.

| Used in adapter | Expected | Where to grep |
|---|---|---|
| `device::AuthenticatorSupportedOptions` fields `is_platform_device` (enum `PlatformDevice::kYes`), `supports_resident_key`, `user_verification_availability` (`UserVerificationAvailability::kSupportedAndConfigured`) | settable public members | `device/fido/authenticator_supported_options.h` |
| `device::AuthenticatorData::DecodeAuthenticatorData(span)` | static, returns optional | `device/fido/authenticator_data.h` |
| `device::AttestationObject(AuthenticatorData, unique_ptr<AttestationStatement>)` | ctor | `device/fido/attestation_object.h` |
| `device::NoneAttestationStatement` (header include `device/fido/opaque_attestation_statement.h` is a guess; real header is probably `device/fido/fido_parsing_utils` / `attestation_statement.h`) | default-constructible | `device/fido/*attestation_statement*.h` |
| `request.rp.id`, `request.user.id/name/display_name` (optional<string>?), `public_key_credential_params.public_key_credential_params()` entries `.algorithm`, `exclude_list[i].id` | field names/types | `device/fido/public/public_key_credential_*.h` |
| `PublicKeyCredentialDescriptor(CredentialType, vector<uint8_t>)` ctor, `PublicKeyCredentialUserEntity(vector<uint8_t>)` ctor | ctor shapes | same |
| `device::AuthenticatorType::kOther` | enum value | `device/fido/fido_authenticator.h` or `public/fido_types.h` |
| `FidoDiscoveryBase::observer()->DiscoveryStarted(this, success, {authenticators})` | per note: yes | note |
| BoringSSL include paths in `authenticator_crypto_boringssl.cc` (`third_party/boringssl/src/include/openssl/...`) | other overlay files use the same prefix? check `vault_crypto_boringssl.cc` | compare |
| `base::Base64UrlEncode(span, policy, &out)` | already used by authenticator_core.cc, compiled | n/a |

Behavior to test after it compiles (manual, on the builder with a display):
1. webauthn.io register: passphrase prompt (first run), then presence prompt, credential saved; vault file exists with mode 0600.
2. Authenticate: unlock prompt only if locked, chooser if several credentials, success.
3. Kill the browser mid-write: vault file still opens (atomic rename); `.rev` never ahead of the vault.
4. Replace the vault file with an older copy: Open is refused (rollback check).
5. Idle capture + passkey flow: zero connections outside the allowlist.

Known gaps (0.1 defaults, decided under Luca's 2026-10-18 autonomy grant):
- Unlock = passphrase only. OS-keyring unlock (libsecret on Linux, DPAPI/Hello on Windows, Credential Manager on Android) is a follow-up; the vault already has the `kKeyring` modes.
- Prompt UI (`PasskeyPromptDelegate`) has no implementation yet: it needs a Corvid WebUI dialog. Until it exists `PasskeyService::Available()` is false and no authenticator is reported, so sites fall back to hardware keys. This is deliberate: never prompt through a stub.
- Hybrid/phone and the Google enclave are off (patch 2004).
