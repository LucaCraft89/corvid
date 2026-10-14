// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. C++ port of reference/authenticator.ts: the CTAP2-shaped software authenticator over the Vault, with NO
// dependency on //device/fido types so it compiles and tests without the FIDO API (the thin adapter that exposes it as a
// device::FidoAuthenticator is a separate, tree-dependent step: see docs/notes/g4-spec.md). Attestation "none", ES256 only,
// all-zero AAGUID, discoverable credentials. Synchronous: the adapter resolves user presence/verification (WebUI
// prompts) first and passes the outcome through UserGate.
#ifndef CORVID_PASSKEYS_AUTHENTICATOR_CORE_H_
#define CORVID_PASSKEYS_AUTHENTICATOR_CORE_H_

#include <functional>
#include <optional>
#include <string>
#include <vector>

<<<<<<< HEAD
=======
#include "base/memory/raw_ptr.h"

>>>>>>> origin/claude/vm-builder-g3-g5
#include "corvid/passkeys/vault.h"

namespace corvid::passkeys {

// P-256 / SHA-256 primitives. Real impl: BoringSSL (EC_KEY / ECDSA_sign, SHA256). Fake in tests.
class AuthenticatorCrypto {
 public:
  virtual ~AuthenticatorCrypto() = default;
  struct KeyPair { Bytes private_key;  /* 32B scalar */ Bytes public_key;  /* 65B uncompressed 0x04||X||Y */ };
  virtual KeyPair GenerateP256() = 0;
  // ECDSA over SHA-256(message), DER-encoded signature.
  virtual Bytes SignEs256Der(const Bytes& private_key, const Bytes& message) = 0;
  virtual Bytes Sha256(const Bytes& data) = 0;
  virtual Bytes Random(size_t n) = 0;
};

enum class CtapError { kOk, kNoCredentials, kCredentialExcluded, kUnsupportedAlgorithm, kOperationDenied, kInvalidParameter };

// Platform supplies these; return false on cancel. UV on Linux = vault unlock recency / passphrase.
class UserGate {
 public:
  enum class Purpose { kCreate, kGet };
  virtual ~UserGate() = default;
  virtual bool Presence(const std::string& rp_id, Purpose p) = 0;
  virtual bool Verification() = 0;
};

struct MakeCredentialRequest {
  std::string rp_id;
  Bytes client_data_hash;  // 32B
  Bytes user_handle;
  std::string user_name, display_name;
  std::vector<int> alg_list;  // COSE alg ids from pubKeyCredParams (type public-key)
  std::vector<Bytes> exclude_list;
  bool resident_key = false;
  bool user_verification = false;
};
struct MakeCredentialResponse { Bytes credential_id, auth_data, attestation_object; };

struct GetAssertionRequest {
  std::string rp_id;
  Bytes client_data_hash;
  std::vector<Bytes> allow_list;
  bool user_verification = false;
  // Conditional UI / multiple candidates: returns the chosen credential id (base64url) or empty to cancel.
  // Receives metadata only (no private keys). If null and several candidates exist, the first is used.
  std::function<std::string(const std::vector<const Credential*>&)> pick_credential;
};
struct GetAssertionResponse {
  Bytes credential_id, auth_data, signature;
  std::optional<Bytes> user_handle;
};

inline constexpr uint8_t kFlagUp = 0x01, kFlagUv = 0x04, kFlagAt = 0x40;

class AuthenticatorCore {
 public:
  AuthenticatorCore(Vault* vault, UserGate* gate, AuthenticatorCrypto* crypto)
      : vault_(vault), gate_(gate), crypto_(crypto) {}

  CtapError MakeCredential(const MakeCredentialRequest& req, MakeCredentialResponse* out);
  CtapError GetAssertion(const GetAssertionRequest& req, GetAssertionResponse* out);

 private:
<<<<<<< HEAD
  Vault* vault_;
  UserGate* gate_;
  AuthenticatorCrypto* crypto_;
=======
  raw_ptr<Vault> vault_;
  raw_ptr<UserGate> gate_;
  raw_ptr<AuthenticatorCrypto> crypto_;
>>>>>>> origin/claude/vm-builder-g3-g5
};

// Deterministic CBOR for exactly the shapes WebAuthn needs (exposed for tests).
Bytes EncodeCoseEs256Key(const Bytes& uncompressed_pub);
Bytes EncodeAttestationObjectNone(const Bytes& auth_data);

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_AUTHENTICATOR_CORE_H_
