// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. See authenticator_core.h. Behavior mirrors reference/authenticator.ts line for line.
#include "corvid/passkeys/authenticator_core.h"

#include <algorithm>

#include "base/base64url.h"
#include "base/time/time.h"

namespace corvid::passkeys {

namespace {

std::string B64(const Bytes& b) {
  std::string out;
  base::Base64UrlEncode(b, base::Base64UrlEncodePolicy::OMIT_PADDING, &out);
  return out;
}
bool UnB64(const std::string& s, Bytes* out) {
  std::string raw;
  if (!base::Base64UrlDecode(s, base::Base64UrlDecodePolicy::DISALLOW_PADDING, &raw)) return false;
  out->assign(raw.begin(), raw.end());
  return true;
}
void Append(Bytes& dst, const Bytes& src) { dst.insert(dst.end(), src.begin(), src.end()); }
void AppendU32(Bytes& dst, uint32_t n) {
  for (int s = 24; s >= 0; s -= 8) dst.push_back(static_cast<uint8_t>(n >> s));
}

// --- minimal CBOR (major types 0,1,2,3,5), definite lengths, canonical key order supplied by the caller ---
void Head(Bytes& o, int major, uint64_t v) {
  const uint8_t m = static_cast<uint8_t>(major << 5);
  if (v < 24) o.push_back(m | v);
  else if (v < 256) { o.push_back(m | 24); o.push_back(static_cast<uint8_t>(v)); }
  else if (v < 65536) { o.push_back(m | 25); o.push_back(v >> 8); o.push_back(v & 255); }
  else { o.push_back(m | 26); AppendU32(o, static_cast<uint32_t>(v)); }
}
void PutInt(Bytes& o, int64_t v) { if (v >= 0) Head(o, 0, v); else Head(o, 1, static_cast<uint64_t>(-1 - v)); }
void PutBytes(Bytes& o, const Bytes& b) { Head(o, 2, b.size()); Append(o, b); }
void PutText(Bytes& o, const std::string& s) { Head(o, 3, s.size()); o.insert(o.end(), s.begin(), s.end()); }

Bytes Utf8(const std::string& s) { return Bytes(s.begin(), s.end()); }

bool Contains(const std::vector<Bytes>& v, const std::string& id_b64) {
  for (const Bytes& b : v) if (B64(b) == id_b64) return true;
  return false;
}

}  // namespace

Bytes EncodeCoseEs256Key(const Bytes& pub) {
  // {1: 2, 3: -7, -1: 1, -2: x, -3: y}: canonical order (positive ints, then negatives) is the order written here.
  Bytes o;
  Head(o, 5, 5);
  PutInt(o, 1); PutInt(o, 2);
  PutInt(o, 3); PutInt(o, -7);
  PutInt(o, -1); PutInt(o, 1);
  PutInt(o, -2); PutBytes(o, Bytes(pub.begin() + 1, pub.begin() + 33));
  PutInt(o, -3); PutBytes(o, Bytes(pub.begin() + 33, pub.begin() + 65));
  return o;
}

Bytes EncodeAttestationObjectNone(const Bytes& auth_data) {
  // {"fmt": "none", "attStmt": {}, "authData": h'...'} in CTAP2 canonical order (shorter keys first).
  Bytes o;
  Head(o, 5, 3);
  PutText(o, "fmt"); PutText(o, "none");
  PutText(o, "attStmt"); Head(o, 5, 0);
  PutText(o, "authData"); PutBytes(o, auth_data);
  return o;
}

CtapError AuthenticatorCore::MakeCredential(const MakeCredentialRequest& req, MakeCredentialResponse* out) {
  if (req.rp_id.empty() || req.client_data_hash.size() != 32) return CtapError::kInvalidParameter;
  if (std::find(req.alg_list.begin(), req.alg_list.end(), -7) == req.alg_list.end())
    return CtapError::kUnsupportedAlgorithm;
  if (vault_->locked()) return CtapError::kOperationDenied;

  std::vector<const Credential*> existing = vault_->FindByRp(req.rp_id);
  for (const Bytes& ex : req.exclude_list) {
    const std::string ex_id = B64(ex);
    for (const Credential* c : existing) {
      if (c->id == ex_id) {
        gate_->Presence(req.rp_id, UserGate::Purpose::kCreate);  // still require touch: do not leak existence
        return CtapError::kCredentialExcluded;
      }
    }
  }
  if (!gate_->Presence(req.rp_id, UserGate::Purpose::kCreate)) return CtapError::kOperationDenied;
  uint8_t flags = kFlagUp | kFlagAt;
  if (req.user_verification) {
    if (!gate_->Verification()) return CtapError::kOperationDenied;
    flags |= kFlagUv;
  }

  AuthenticatorCrypto::KeyPair kp = crypto_->GenerateP256();
  if (kp.public_key.size() != 65 || kp.public_key[0] != 0x04 || kp.private_key.size() != 32)
    return CtapError::kInvalidParameter;
  const Bytes cred_id = crypto_->Random(32);

  Credential c;
  c.id = B64(cred_id);
  c.rp_id = req.rp_id;
  c.user_handle = B64(req.user_handle);
  c.user_name = req.user_name;
  c.display_name = req.display_name;
  c.alg = -7;
  c.private_key = B64(kp.private_key);
  c.sign_count = 0;
  c.created_at = base::Time::Now().InMillisecondsSinceUnixEpoch();
  c.discoverable = req.resident_key;
  if (vault_->Add(std::move(c)) != VaultError::kOk) return CtapError::kOperationDenied;

  Bytes auth_data = crypto_->Sha256(Utf8(req.rp_id));
  auth_data.push_back(flags);
  AppendU32(auth_data, 0);
  auth_data.insert(auth_data.end(), 16, 0);  // all-zero AAGUID: privacy-preserving with attestation "none"
  auth_data.push_back(static_cast<uint8_t>(cred_id.size() >> 8));
  auth_data.push_back(static_cast<uint8_t>(cred_id.size() & 255));
  Append(auth_data, cred_id);
  Append(auth_data, EncodeCoseEs256Key(kp.public_key));
  std::fill(kp.private_key.begin(), kp.private_key.end(), 0);

  out->credential_id = cred_id;
  out->attestation_object = EncodeAttestationObjectNone(auth_data);
  out->auth_data = std::move(auth_data);
  return CtapError::kOk;
}

CtapError AuthenticatorCore::GetAssertion(const GetAssertionRequest& req, GetAssertionResponse* out) {
  if (req.rp_id.empty() || req.client_data_hash.size() != 32) return CtapError::kInvalidParameter;
  if (vault_->locked()) return CtapError::kOperationDenied;

  std::vector<const Credential*> cands;
  for (const Credential* c : vault_->FindByRp(req.rp_id)) {
    if (!req.allow_list.empty() ? Contains(req.allow_list, c->id) : c->discoverable) cands.push_back(c);
  }
  if (cands.empty()) return CtapError::kNoCredentials;

  const Credential* chosen = cands.front();
  if (cands.size() > 1 || req.pick_credential) {
    if (req.pick_credential) {
      const std::string id = req.pick_credential(cands);
      chosen = nullptr;
      for (const Credential* c : cands) if (c->id == id) chosen = c;
      if (!chosen) return CtapError::kOperationDenied;
    }
  }
  if (!gate_->Presence(req.rp_id, UserGate::Purpose::kGet)) return CtapError::kOperationDenied;
  uint8_t flags = kFlagUp;
  if (req.user_verification) {
    if (!gate_->Verification()) return CtapError::kOperationDenied;
    flags |= kFlagUv;
  }

  const std::string chosen_id = chosen->id;
  const bool return_user = cands.size() > 1 || req.allow_list.empty();
  vault_->BumpSignCount(chosen_id);
  chosen = vault_->Get(chosen_id);  // re-fetch: pointers stay valid but keep the updated count explicit
  Bytes auth_data = crypto_->Sha256(Utf8(req.rp_id));
  auth_data.push_back(flags);
  AppendU32(auth_data, chosen->sign_count);

  Bytes priv;
  if (!UnB64(chosen->private_key, &priv)) return CtapError::kInvalidParameter;
  Bytes message = auth_data;
  Append(message, req.client_data_hash);
  out->signature = crypto_->SignEs256Der(priv, message);
  std::fill(priv.begin(), priv.end(), 0);

  UnB64(chosen->id, &out->credential_id);
  out->auth_data = std::move(auth_data);
  if (return_user) {
    Bytes uh;
    if (UnB64(chosen->user_handle, &uh)) out->user_handle = std::move(uh);
  }
  return CtapError::kOk;
}

}  // namespace corvid::passkeys
