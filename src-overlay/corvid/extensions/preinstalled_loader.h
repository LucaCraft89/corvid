// Corvid: loads extensions/preinstalled.toml's emitted JSON as an external
// extensions source (patch extensions/0320). Compiled against Chromium 155.
#ifndef CORVID_EXTENSIONS_PREINSTALLED_LOADER_H_
#define CORVID_EXTENSIONS_PREINSTALLED_LOADER_H_

#include "base/files/file_path.h"
#include "chrome/browser/extensions/external_loader.h"

namespace corvid {

// Reads <dir of the executable>/corvid/preinstalled_extensions.json, a
// dictionary of extension id -> {external_crx, external_version} (paths are
// relative to that directory) or {external_update_url}. A missing file means
// nothing is preinstalled.
class PreinstalledExtensionsLoader : public extensions::ExternalLoader {
 public:
  PreinstalledExtensionsLoader();

  void StartLoading() override;
  const base::FilePath GetBaseCrxFilePath() override;

  static base::FilePath GetDirectory();

 private:
  ~PreinstalledExtensionsLoader() override;
};

}  // namespace corvid

#endif  // CORVID_EXTENSIONS_PREINSTALLED_LOADER_H_
