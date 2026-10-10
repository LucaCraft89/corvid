// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/webui/corvid_resources.h"

#include <algorithm>
#include <set>

#include "base/strings/strcat.h"

namespace corvid {

std::vector<std::string> CorvidPageNames() {
  std::set<std::string> names;
  for (const EmbeddedFile& file : CorvidWebuiFiles()) {
    std::string_view path = file.path;
    std::string_view dir = path.substr(0, path.find('/'));
    if (dir != "shared") names.emplace(dir);
  }
  return {names.begin(), names.end()};
}

const EmbeddedFile* FindCorvidFile(std::string_view page, std::string_view path) {
  // Pages are single-document apps: extension-less sub-paths ("settings/privacy") are client-side routes.
  if (path.empty() || path.find('.') == std::string_view::npos) path = "index.html";
  for (const std::string& want : {base::StrCat({page, "/", path}), base::StrCat({"shared/", path})}) {
    for (const EmbeddedFile& file : CorvidWebuiFiles()) {
      if (want == file.path) return &file;
    }
  }
  return nullptr;
}

}  // namespace corvid
