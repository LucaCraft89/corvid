// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. See vault.h. File format = reference/vault.ts VaultFile (JSON, v=1).
#include "corvid/passkeys/vault.h"

#include <algorithm>
#include <utility>

#include "base/base64url.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/strings/strcat.h"
#include "base/strings/string_number_conversions.h"
#include "base/values.h"

namespace corvid::passkeys {

namespace {

constexpr uint32_t kMaxM = 4 * 1024 * 1024, kMaxT = 64, kMaxP = 16;

bool KdfOk(const KdfParams& k) {
  return k.m >= kMinKdf.m && k.t >= kMinKdf.t && k.p >= 1 && k.m <= kMaxM && k.t <= kMaxT && k.p <= kMaxP;
}

std::string B64(const Bytes& b) {
  std::string out;
  base::Base64UrlEncode(b, base::Base64UrlEncodePolicy::OMIT_PADDING, &out);
  return out;
}
bool UnB64(const std::string* s, Bytes* out) {
  if (!s) return false;
  std::string raw;
  if (!base::Base64UrlDecode(*s, base::Base64UrlDecodePolicy::DISALLOW_PADDING, &raw)) return false;
  out->assign(raw.begin(), raw.end());
  return true;
}
Bytes ToBytes(const std::string& s) { return Bytes(s.begin(), s.end()); }

std::optional<UnlockMode> ParseMode(const std::string& s) {
  if (s == "passphrase") return UnlockMode::kPassphrase;
  if (s == "keyring") return UnlockMode::kKeyring;
  if (s == "passphrase+keyring") return UnlockMode::kPassphraseAndKeyring;
  return std::nullopt;
}

void Wipe(Bytes& b) { std::fill(b.begin(), b.end(), 0); b.clear(); }

// KEK = HKDF-SHA256(ikm = argon2id(pass) || keyring?, salt, info = "corvid-vault-kek-v1:<mode>")
VaultError DeriveKek(VaultCrypto* c, UnlockMode mode, const std::string& pass, const std::optional<Bytes>& ks,
                     const KdfParams& kdf, const Bytes& salt, Bytes* kek) {
  Bytes ikm;
  if (mode != UnlockMode::kKeyring) {
    if (pass.empty()) return VaultError::kLocked;
    // NFKC normalization (vault.ts) is applied by the caller's UI layer; TODO(tree): ICU normalize here
    // (icu::Normalizer2::getNFKCInstance) before hashing so non-ASCII passphrases interoperate with the TS side.
    std::optional<Bytes> pk = c->Argon2id(pass, salt, kdf.m, kdf.t, kdf.p);
    if (!pk) return VaultError::kUnsupported;
    ikm = std::move(*pk);
  }
  if (mode != UnlockMode::kPassphrase) {
    if (!ks) return VaultError::kKeyringMissing;
    ikm.insert(ikm.end(), ks->begin(), ks->end());
  }
  *kek = c->HkdfSha256(ikm, salt, base::StrCat({"corvid-vault-kek-v1:", UnlockModeName(mode)}), 32);
  Wipe(ikm);
  return VaultError::kOk;
}

base::Value::Dict CredToDict(const Credential& c) {
  base::Value::Dict d;
  d.Set("id", c.id);
  d.Set("rpId", c.rp_id);
  d.Set("userHandle", c.user_handle);
  d.Set("userName", c.user_name);
  d.Set("displayName", c.display_name);
  d.Set("alg", c.alg);
  d.Set("privateKey", c.private_key);
  d.Set("signCount", static_cast<double>(c.sign_count));
  d.Set("createdAt", static_cast<double>(c.created_at));
  if (!c.label.empty()) d.Set("label", c.label);
  d.Set("discoverable", c.discoverable);
  return d;
}

bool DictToCred(const base::Value::Dict& d, Credential* c) {
  const std::string *id = d.FindString("id"), *rp = d.FindString("rpId"), *uh = d.FindString("userHandle"),
                    *un = d.FindString("userName"), *dn = d.FindString("displayName"),
                    *pk = d.FindString("privateKey");
  if (!id || !rp || !uh || !un || !dn || !pk) return false;
  c->id = *id; c->rp_id = *rp; c->user_handle = *uh; c->user_name = *un; c->display_name = *dn; c->private_key = *pk;
  c->alg = d.FindInt("alg").value_or(-7);
  c->sign_count = static_cast<uint32_t>(d.FindDouble("signCount").value_or(0));
  c->created_at = static_cast<int64_t>(d.FindDouble("createdAt").value_or(0));
  if (const std::string* l = d.FindString("label")) c->label = *l;
  c->discoverable = d.FindBool("discoverable").value_or(true);
  return true;
}

}  // namespace

const char* UnlockModeName(UnlockMode m) {
  switch (m) {
    case UnlockMode::kPassphrase: return "passphrase";
    case UnlockMode::kKeyring: return "keyring";
    case UnlockMode::kPassphraseAndKeyring: return "passphrase+keyring";
  }
  return "passphrase";
}

Vault::Vault(VaultCrypto* crypto) : crypto_(crypto) {}
Vault::~Vault() { Lock(); }

// Canonical header bytes: JSON array in fixed order, no spaces: [1,"mode","argon2id",m,t,p,"salt",revision].
std::string Vault::HeaderAad(uint64_t revision) const {
  return base::StrCat({"[1,\"", UnlockModeName(mode_), "\",\"argon2id\",", base::NumberToString(kdf_.m), ",",
                       base::NumberToString(kdf_.t), ",", base::NumberToString(kdf_.p), ",\"", B64(salt_), "\",",
                       base::NumberToString(revision), "]"});
}

// static
VaultError Vault::Create(VaultCrypto* crypto, const CreateOptions& opts, std::unique_ptr<Vault>* out,
                         Bytes* new_keyring_secret) {
  if (!KdfOk(opts.kdf)) return VaultError::kKdfTooWeak;
  std::optional<Bytes> ks;
  if (opts.mode != UnlockMode::kPassphrase) {
    ks = opts.keyring_secret ? *opts.keyring_secret : crypto->Random(32);
    if (new_keyring_secret) *new_keyring_secret = *ks;
  }
  std::unique_ptr<Vault> v(new Vault(crypto));
  v->mode_ = opts.mode;
  v->kdf_ = opts.kdf;
  v->salt_ = crypto->Random(16);
  VaultError e = DeriveKek(crypto, v->mode_, opts.passphrase, ks, v->kdf_, v->salt_, &v->kek_);
  if (e != VaultError::kOk) return e;
  v->vault_key_ = crypto->Random(32);
  v->locked_ = false;
  *out = std::move(v);
  return VaultError::kOk;
}

// static
VaultError Vault::Open(VaultCrypto* crypto, const std::string& file_json, const OpenOptions& opts,
                       std::unique_ptr<Vault>* out) {
  std::optional<base::Value> parsed = base::JSONReader::Read(file_json);
  if (!parsed || !parsed->is_dict()) return VaultError::kBadFormat;
  const base::Value::Dict& f = parsed->GetDict();
  const base::Value::Dict* kdf = f.FindDict("kdf");
  const std::string* mode_s = f.FindString("mode");
  if (f.FindInt("v") != 1 || !kdf || !mode_s) return VaultError::kBadFormat;
  const std::string* alg = kdf->FindString("alg");
  std::optional<UnlockMode> mode = ParseMode(*mode_s);
  std::optional<int> m = kdf->FindInt("m"), t = kdf->FindInt("t"), p = kdf->FindInt("p");
  std::optional<double> rev = f.FindDouble("revision");
  Bytes salt, wrap_nonce, wrapped, body_nonce, body;
  if (!alg || *alg != "argon2id" || !mode || !m || !t || !p || !rev || *rev < 0 ||
      !UnB64(kdf->FindString("salt"), &salt) || !UnB64(f.FindString("wrapNonce"), &wrap_nonce) ||
      !UnB64(f.FindString("wrappedKey"), &wrapped) || !UnB64(f.FindString("bodyNonce"), &body_nonce) ||
      !UnB64(f.FindString("body"), &body) || *m < 0 || *t < 0 || *p < 0)
    return VaultError::kBadFormat;

  std::unique_ptr<Vault> v(new Vault(crypto));
  v->mode_ = *mode;
  v->kdf_ = {static_cast<uint32_t>(*m), static_cast<uint32_t>(*t), static_cast<uint32_t>(*p)};
  v->salt_ = salt;
  v->revision_ = static_cast<uint64_t>(*rev);
  if (!KdfOk(v->kdf_)) return VaultError::kKdfTooWeak;

  VaultError e = DeriveKek(crypto, v->mode_, opts.passphrase, opts.keyring_secret, v->kdf_, salt, &v->kek_);
  if (e == VaultError::kLocked || e == VaultError::kKeyringMissing || e == VaultError::kUnsupported) return e;

  const Bytes aad = ToBytes(v->HeaderAad(v->revision_));
  // Wrong secret and tampering are deliberately indistinguishable.
  std::optional<Bytes> vault_key = crypto->Open(v->kek_, wrap_nonce, aad, wrapped);
  std::optional<Bytes> plain = vault_key ? crypto->Open(*vault_key, body_nonce, aad, body) : std::nullopt;
  if (!plain) return VaultError::kAuthFailed;
  std::optional<base::Value> bv = base::JSONReader::Read(std::string(plain->begin(), plain->end()));
  Wipe(*plain);
  const base::Value::List* creds = bv && bv->is_dict() ? bv->GetDict().FindList("credentials") : nullptr;
  if (!creds) return VaultError::kAuthFailed;
  for (const base::Value& cv : *creds) {
    Credential c;
    if (!cv.is_dict() || !DictToCred(cv.GetDict(), &c)) return VaultError::kAuthFailed;
    v->credentials_.push_back(std::move(c));
  }
  v->vault_key_ = std::move(*vault_key);
  v->locked_ = false;
  *out = std::move(v);
  return VaultError::kOk;
}

std::string Vault::Serialize() {
  if (locked_) return std::string();
  const uint64_t revision = revision_ + 1;
  const Bytes aad = ToBytes(HeaderAad(revision));
  const Bytes wrap_nonce = crypto_->Random(24), body_nonce = crypto_->Random(24);

  base::Value::List creds;
  for (const Credential& c : credentials_) creds.Append(CredToDict(c));
  base::Value::Dict body;
  body.Set("credentials", std::move(creds));
  body.Set("revision", static_cast<double>(revision));
  std::string body_json = base::WriteJson(body).value_or("{}");

  base::Value::Dict kdf;
  kdf.Set("alg", "argon2id");
  kdf.Set("m", static_cast<int>(kdf_.m));
  kdf.Set("t", static_cast<int>(kdf_.t));
  kdf.Set("p", static_cast<int>(kdf_.p));
  kdf.Set("salt", B64(salt_));
  base::Value::Dict f;
  f.Set("v", 1);
  f.Set("mode", UnlockModeName(mode_));
  f.Set("kdf", std::move(kdf));
  f.Set("revision", static_cast<double>(revision));
  f.Set("wrapNonce", B64(wrap_nonce));
  f.Set("wrappedKey", B64(crypto_->Seal(kek_, wrap_nonce, aad, vault_key_)));
  f.Set("bodyNonce", B64(body_nonce));
  f.Set("body", B64(crypto_->Seal(vault_key_, body_nonce, aad, ToBytes(body_json))));
  revision_ = revision;
  return base::WriteJson(f).value_or(std::string());
}

void Vault::Lock() {
  Wipe(vault_key_);
  Wipe(kek_);
  for (Credential& c : credentials_) std::fill(c.private_key.begin(), c.private_key.end(), '\0');
  credentials_.clear();
  locked_ = true;
}

VaultError Vault::Add(Credential c) {
  if (locked_) return VaultError::kLocked;
  credentials_.push_back(std::move(c));
  return VaultError::kOk;
}
const Credential* Vault::Get(const std::string& id) const {
  if (locked_) return nullptr;
  for (const Credential& c : credentials_) if (c.id == id) return &c;
  return nullptr;
}
std::vector<const Credential*> Vault::FindByRp(const std::string& rp_id) const {
  std::vector<const Credential*> r;
  if (locked_) return r;
  for (const Credential& c : credentials_) if (c.rp_id == rp_id) r.push_back(&c);
  return r;
}
bool Vault::Delete(const std::string& id) {
  if (locked_) return false;
  auto it = std::remove_if(credentials_.begin(), credentials_.end(), [&](const Credential& c) { return c.id == id; });
  const bool removed = it != credentials_.end();
  credentials_.erase(it, credentials_.end());
  return removed;
}
bool Vault::Rename(const std::string& id, const std::string& label) {
  if (locked_) return false;
  for (Credential& c : credentials_) if (c.id == id) { c.label = label; return true; }
  return false;
}
void Vault::BumpSignCount(const std::string& id) {
  if (locked_) return;
  for (Credential& c : credentials_) if (c.id == id) { ++c.sign_count; return; }
}

}  // namespace corvid::passkeys
