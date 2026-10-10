// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#ifndef CORVID_WEBUI_CORVID_RESOURCES_H_
#define CORVID_WEBUI_CORVID_RESOURCES_H_

#include <stddef.h>
#include <stdint.h>

#include <string>
#include <string_view>
#include <vector>

#include "base/containers/span.h"

namespace corvid {

// Files bundled from ui/pages by ui/tools/bundle.mjs and embedded by embed_resources.py (generated corvid_resources.cc).
// path = "<page>/<file>" or "shared/<file>".
struct EmbeddedFile {
  const char* path;
  const uint8_t* data;
  size_t size;
};
// Defined in the generated corvid_embedded_files.cc.
base::span<const EmbeddedFile> CorvidWebuiFiles();

// Names of the bundled pages ("settings", "history", ...), sorted, without "shared".
std::vector<std::string> CorvidPageNames();

// Resolves |path| (request path, "" = index.html) for |page|; falls back to shared/. nullptr when missing.
const EmbeddedFile* FindCorvidFile(std::string_view page, std::string_view path);

}  // namespace corvid

#endif  // CORVID_WEBUI_CORVID_RESOURCES_H_
