// Corvid: see preinstalled_loader.h. Compiled against Chromium 155.
#include "corvid/extensions/preinstalled_loader.h"

#include <utility>

#include "base/files/file_util.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/logging.h"
#include "base/path_service.h"
#include "base/task/thread_pool.h"
#include "base/values.h"

namespace corvid {

namespace {

base::DictValue ReadPreinstalled() {
  base::FilePath file = PreinstalledExtensionsLoader::GetDirectory().Append(
      FILE_PATH_LITERAL("preinstalled_extensions.json"));
  std::string contents;
  if (!base::ReadFileToString(file, &contents)) {
    return base::DictValue();
  }
  std::optional<base::Value> parsed = base::JSONReader::Read(contents, base::JSON_PARSE_RFC);
  if (!parsed || !parsed->is_dict()) {
    LOG(WARNING) << "Corvid: ignoring malformed " << file.value();
    return base::DictValue();
  }
  return std::move(parsed->GetDict());
}

}  // namespace

PreinstalledExtensionsLoader::PreinstalledExtensionsLoader() = default;
PreinstalledExtensionsLoader::~PreinstalledExtensionsLoader() = default;

// static
base::FilePath PreinstalledExtensionsLoader::GetDirectory() {
  base::FilePath exe_dir;
  if (!base::PathService::Get(base::DIR_EXE, &exe_dir)) {
    return base::FilePath();
  }
  return exe_dir.Append(FILE_PATH_LITERAL("corvid"));
}

const base::FilePath PreinstalledExtensionsLoader::GetBaseCrxFilePath() {
  return GetDirectory();
}

void PreinstalledExtensionsLoader::StartLoading() {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE},
      base::BindOnce(&ReadPreinstalled),
      base::BindOnce(&PreinstalledExtensionsLoader::LoadFinished, this));
}

}  // namespace corvid
