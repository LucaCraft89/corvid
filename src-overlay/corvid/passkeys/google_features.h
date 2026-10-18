// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Switches for the WebAuthn pieces that talk to Google-run services. Both are off unless the user turns them on.
#ifndef CORVID_PASSKEYS_GOOGLE_FEATURES_H_
#define CORVID_PASSKEYS_GOOGLE_FEATURES_H_

namespace corvid::passkeys {

// Chrome's Google Password Manager enclave authenticator (needs a Google account; contacts Google servers). Always off.
bool GoogleEnclaveEnabled();

// Hybrid ("use a phone or tablet", caBLE v2): the QR flow relays through Google-run tunnel servers. Off by default; the
// command-line switch --enable-passkey-hybrid turns it on until a settings toggle exists.
bool HybridDiscoveryEnabled();

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_GOOGLE_FEATURES_H_
