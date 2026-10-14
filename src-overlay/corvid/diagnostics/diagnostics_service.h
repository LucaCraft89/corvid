// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. Browser-side implementation of corvid.diagnostics.mojom.DiagnosticsService over the EventBus. Query, Subscribe,
// retention and Clear are real; the export methods and CaptureFreezeStack report "not implemented" (ok=false) until the
// export bundle writer and the freeze stack backend exist (see docs/notes/g4-spec.md). BlockRenderer is
// [EnableIf=corvid_dev] in the mojom, so it is only generated/overridden in dev builds and is not implemented here.
// Generated names assumed (standard mojom C++ bindings): corvid::diagnostics::mojom::{DiagnosticsService, EventObserver,
// Event, EventPtr, Filter, FilterPtr, RetentionConfig, RetentionConfigPtr, Kind, Severity}.
#ifndef CORVID_DIAGNOSTICS_DIAGNOSTICS_SERVICE_H_
#define CORVID_DIAGNOSTICS_DIAGNOSTICS_SERVICE_H_

#include <string>

#include "corvid/diagnostics/diagnostics.mojom.h"
#include "corvid/diagnostics/event_bus.h"
#include "mojo/public/cpp/bindings/remote_set.h"

namespace corvid::diagnostics {

// Pure helpers (unit tested): string kinds/severities used in the ring buffer <-> mojom enums.
bool KindFromString(const std::string& s, mojom::Kind* out);
std::string KindToString(mojom::Kind k);
bool SeverityFromString(const std::string& s, mojom::Severity* out);
// True if the event passes every non-empty criterion of the filter (kinds, min severity, tab, since, text, NOT limit).
bool EventMatchesFilter(const Event& e, const mojom::Filter& f);
mojom::EventPtr ToMojo(const Event& e);

class DiagnosticsService : public mojom::DiagnosticsService, public EventBus::Observer {
 public:
  explicit DiagnosticsService(EventBus* bus);
  ~DiagnosticsService() override;

  // mojom::DiagnosticsService:
  void Query(mojom::FilterPtr filter, QueryCallback callback) override;
  void Subscribe(mojo::PendingRemote<mojom::EventObserver> observer) override;
  void GetRetention(GetRetentionCallback callback) override;
  void SetRetention(mojom::RetentionConfigPtr config, SetRetentionCallback callback) override;
  void Clear(ClearCallback callback) override;
  void PreviewExport(mojom::FilterPtr filter, bool redact, PreviewExportCallback callback) override;
  void CommitExport(const std::string& token, CommitExportCallback callback) override;
  void CaptureFreezeStack(int32_t tab_id, CaptureFreezeStackCallback callback) override;

  // EventBus::Observer:
  void OnEvent(const Event& event) override;

 private:
  raw_ptr<EventBus> bus_;
  mojo::RemoteSet<mojom::EventObserver> observers_;
  Retention retention_;
};

}  // namespace corvid::diagnostics

#endif  // CORVID_DIAGNOSTICS_DIAGNOSTICS_SERVICE_H_
