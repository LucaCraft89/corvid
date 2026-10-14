// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. See diagnostics_service.h.
#include "corvid/diagnostics/diagnostics_service.h"

#include <algorithm>
#include <utility>

#include "base/strings/string_util.h"

namespace corvid::diagnostics {

namespace {
struct KindName { mojom::Kind kind; const char* name; };
constexpr KindName kKinds[] = {
    {mojom::Kind::kHang, "hang"},       {mojom::Kind::kFreeze, "freeze"},
    {mojom::Kind::kCrash, "crash"},     {mojom::Kind::kNetError, "net_error"},
    {mojom::Kind::kTls, "tls"},         {mojom::Kind::kConsole, "console"},
    {mojom::Kind::kMemory, "memory"},   {mojom::Kind::kExtensionError, "extension_error"},
    {mojom::Kind::kServiceWorker, "service_worker"},
};
struct SevName { mojom::Severity sev; const char* name; };
constexpr SevName kSevs[] = {
    {mojom::Severity::kDebug, "debug"}, {mojom::Severity::kInfo, "info"}, {mojom::Severity::kWarning, "warning"},
    {mojom::Severity::kError, "error"}, {mojom::Severity::kFatal, "fatal"},
};
}  // namespace

bool KindFromString(const std::string& s, mojom::Kind* out) {
  for (const auto& k : kKinds) if (s == k.name) { *out = k.kind; return true; }
  return false;
}
std::string KindToString(mojom::Kind k) {
  for (const auto& e : kKinds) if (e.kind == k) return e.name;
  return "";
}
bool SeverityFromString(const std::string& s, mojom::Severity* out) {
  for (const auto& e : kSevs) if (s == e.name) { *out = e.sev; return true; }
  return false;
}

bool EventMatchesFilter(const Event& e, const mojom::Filter& f) {
  if (!f.kinds.empty()) {
    mojom::Kind k;
    if (!KindFromString(e.kind, &k) || std::find(f.kinds.begin(), f.kinds.end(), k) == f.kinds.end()) return false;
  }
  mojom::Severity sev;
  if (!SeverityFromString(e.severity, &sev)) sev = mojom::Severity::kInfo;
  if (static_cast<int>(sev) < static_cast<int>(f.min_severity)) return false;
  if (f.tab_id != -1 && e.tab_id != f.tab_id) return false;
  if (f.since_ms > 0 && e.ts_ms < f.since_ms) return false;
  if (!f.text.empty()) {
    const std::string needle = base::ToLowerASCII(f.text);
    if (base::ToLowerASCII(e.data_json).find(needle) == std::string::npos &&
        base::ToLowerASCII(e.source).find(needle) == std::string::npos &&
        base::ToLowerASCII(e.kind).find(needle) == std::string::npos)
      return false;
  }
  return true;
}

mojom::EventPtr ToMojo(const Event& e) {
  auto m = mojom::Event::New();
  m->id = e.id;
  m->ts_ms = e.ts_ms;
  m->tab_id = e.tab_id;
  m->frame_id = -1;
  m->source = e.source;
  if (!SeverityFromString(e.severity, &m->severity)) m->severity = mojom::Severity::kInfo;
  if (!KindFromString(e.kind, &m->kind)) m->kind = mojom::Kind::kConsole;
  m->data_json = e.data_json;
  return m;
}

DiagnosticsService::DiagnosticsService(EventBus* bus) : bus_(bus) { bus_->AddObserver(this); }
DiagnosticsService::~DiagnosticsService() { bus_->RemoveObserver(this); }

void DiagnosticsService::Query(mojom::FilterPtr filter, QueryCallback callback) {
  std::vector<mojom::EventPtr> out;
  std::vector<Event> all = bus_->Snapshot();
  // Newest first, capped at filter->limit (0 = no cap).
  for (auto it = all.rbegin(); it != all.rend(); ++it) {
    if (filter && !EventMatchesFilter(*it, *filter)) continue;
    out.push_back(ToMojo(*it));
    if (filter && filter->limit > 0 && out.size() >= filter->limit) break;
  }
  std::move(callback).Run(std::move(out));
}

void DiagnosticsService::Subscribe(mojo::PendingRemote<mojom::EventObserver> observer) {
  observers_.Add(std::move(observer));
}

void DiagnosticsService::GetRetention(GetRetentionCallback callback) {
  std::move(callback).Run(mojom::RetentionConfig::New(retention_.max_bytes, static_cast<uint32_t>(retention_.max_events),
                                                      retention_.max_age_ms));
}

void DiagnosticsService::SetRetention(mojom::RetentionConfigPtr config, SetRetentionCallback callback) {
  // Reject nonsense (zero caps would silently disable collection; the UI offers explicit presets).
  if (!config || config->max_bytes == 0 || config->max_events == 0 || config->max_age_ms <= 0) {
    std::move(callback).Run(false);
    return;
  }
  retention_.max_bytes = config->max_bytes;
  retention_.max_events = config->max_events;
  retention_.max_age_ms = config->max_age_ms;
  bus_->SetRetention(retention_);
  std::move(callback).Run(true);
}

void DiagnosticsService::Clear(ClearCallback callback) {
  bus_->Clear();
  std::move(callback).Run();
}

void DiagnosticsService::PreviewExport(mojom::FilterPtr, bool, PreviewExportCallback callback) {
  // Not implemented: needs the export bundle writer (two-step, user-initiated, exactly the previewed files).
  std::move(callback).Run(mojom::ExportPreview::New(), std::string());
}
void DiagnosticsService::CommitExport(const std::string&, CommitExportCallback callback) {
  std::move(callback).Run(false, std::string());
}
void DiagnosticsService::CaptureFreezeStack(int32_t, CaptureFreezeStackCallback callback) {
  // Not implemented: no desktop stack backend (docs/notes/g4-spec.md, stack-capture finding).
  std::move(callback).Run(false, std::string());
}

void DiagnosticsService::OnEvent(const Event& event) {
  for (auto& obs : observers_) obs->OnEvent(ToMojo(event));
}

}  // namespace corvid::diagnostics
