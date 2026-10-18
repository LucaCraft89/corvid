// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/passkeys/google_features.h"

#include "base/command_line.h"

namespace corvid::passkeys {

bool GoogleEnclaveEnabled() {
  return false;
}

bool HybridDiscoveryEnabled() {
  return base::CommandLine::ForCurrentProcess()->HasSwitch("enable-passkey-hybrid");
}

}  // namespace corvid::passkeys
