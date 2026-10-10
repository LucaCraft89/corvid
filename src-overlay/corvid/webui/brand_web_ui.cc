// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/webui/brand_web_ui.h"

#include <memory>
#include <string>

#include "base/functional/bind.h"
#include "base/memory/ref_counted_memory.h"
#include "base/compiler_specific.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/browser/webui_config.h"
#include "content/public/browser/webui_config_map.h"
#include "content/public/common/url_constants.h"
#include "corvid/webui/corvid_resources.h"
#include "corvid/webui/brand_url_handler.h"
#include "corvid/webui/stock_page_policy.h"
#include "corvid/webui/brand.h"
#include "services/network/public/mojom/content_security_policy.mojom.h"

namespace corvid {

namespace {

class CorvidWebUIController : public content::WebUIController {
 public:
  CorvidWebUIController(content::WebUI* web_ui, std::string page) : content::WebUIController(web_ui) {
    content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
        web_ui->GetWebContents()->GetBrowserContext(), std::string(kBrandHostPrefix) + page);
    // Lit (the page framework) creates a 'lit-html' Trusted Types policy; keep Trusted Types enforced otherwise.
    source->OverrideContentSecurityPolicy(network::mojom::CSPDirectiveName::TrustedTypes, "trusted-types lit-html;");
    source->SetRequestFilter(
        base::BindRepeating([](const std::string& page, const std::string& path) { return FindCorvidFile(page, path) != nullptr; }, page),
        base::BindRepeating(
            [](const std::string& page, const std::string& path, content::WebUIDataSource::GotDataCallback callback) {
              const EmbeddedFile* f = FindCorvidFile(page, path);
              std::move(callback).Run(f ? base::MakeRefCounted<base::RefCountedStaticMemory>(
                                 UNSAFE_BUFFERS(base::span(f->data, f->size))) : nullptr);
            },
            page));
  }
};

class CorvidWebUIConfig : public content::WebUIConfig {
 public:
  explicit CorvidWebUIConfig(std::string page)
      : content::WebUIConfig(content::kChromeUIScheme, std::string(kBrandHostPrefix) + page), page_(std::move(page)) {}

  std::unique_ptr<content::WebUIController> CreateWebUIController(content::WebUI* web_ui, const GURL&) override {
    return std::make_unique<CorvidWebUIController>(web_ui, page_);
  }

 private:
  std::string page_;
};

}  // namespace

void RegisterWebUIConfigs() {
  content::WebUIConfigMap& map = content::WebUIConfigMap::GetInstance();
  for (const std::string& page : CorvidPageNames()) map.AddWebUIConfig(std::make_unique<CorvidWebUIConfig>(page));
}

void RemoveStockWebUIConfigs() {
  content::WebUIConfigMap& map = content::WebUIConfigMap::GetInstance();
  for (const content::WebUIConfigInfo& info : map.GetWebUIConfigList(/*browser_context=*/nullptr)) {
    if (info.origin.scheme() == content::kChromeUIScheme && !info.origin.host().starts_with(kBrandHostPrefix) &&
        !info.origin.host().ends_with(".top-chrome") && !IsInternalToolHost(info.origin.host())) {
      map.RemoveConfig(info.origin.GetURL());
    }
  }
}

}  // namespace corvid
