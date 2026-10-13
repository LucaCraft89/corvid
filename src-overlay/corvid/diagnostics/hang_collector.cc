// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (uncompiled). See hang_collector.h. Depends on event_bus.h and stack_sampler.h (now written, also unbuilt).
#include "corvid/diagnostics/hang_collector.h"

#include "base/json/json_writer.h"
#include "base/strings/strcat.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/stringprintf.h"
#include "base/strings/utf_string_conversions.h"
#include "base/values.h"
#include "content/public/browser/render_process_host.h"
#include "content/public/browser/web_contents.h"
#include "corvid/diagnostics/event_bus.h"
#include "corvid/diagnostics/stack_sampler.h"

namespace corvid::diagnostics {

WEB_CONTENTS_USER_DATA_KEY_IMPL(HangCollector);

HangCollector::HangCollector(content::WebContents* wc)
    : content::WebContentsObserver(wc), content::WebContentsUserData<HangCollector>(*wc),
      bus_(EventBus::Get()) {}
HangCollector::~HangCollector() = default;

void HangCollector::OnRendererUnresponsive(content::RenderProcessHost* host) {
  hang_started_ = base::TimeTicks::Now();
  // Capture BEFORE emitting so the event carries the stack; sampler is async, so emit now with
  // stackCaptured=false and a follow-up update event keyed by the same hang id.
  base::DictValue d;
  d.Set("durationMs", 0);
  d.Set("stackCaptured", false);
  d.Set("recovered", false);
  d.Set("renderPid", static_cast<int>(host->GetProcess().Pid()));
  d.Set("stack", base::ListValue());
  uint64_t id = bus_->Emit({.kind = "hang", .severity = "error", .source = "renderer",
                            .tab_id = TabIdFor(web_contents()), .data = std::move(d)});
  StackSampler::CaptureMainThread(host, base::BindOnce(
      [](EventBus* bus, uint64_t id, std::vector<StackFrame> frames) {
        bus->Amend(id, [&](base::DictValue& d) {
          d.Set("stackCaptured", !frames.empty());
          d.Set("stack", FramesToValue(frames));
        });
      }, bus_.get(), id));
}

void HangCollector::OnRendererResponsive(content::RenderProcessHost*) {
  if (hang_started_.is_null()) return;
  base::DictValue d;
  d.Set("durationMs", static_cast<int>((base::TimeTicks::Now() - hang_started_).InMilliseconds()));
  d.Set("recovered", true);
  d.Set("stackCaptured", false);
  d.Set("stack", base::ListValue());
  d.Set("renderPid", 0);
  bus_->Emit({.kind = "hang", .severity = "info", .source = "renderer",
              .tab_id = TabIdFor(web_contents()), .data = std::move(d)});
  hang_started_ = base::TimeTicks();
}

void HangCollector::PrimaryMainFrameRenderProcessGone(base::TerminationStatus status) {
  // Local-only crash record. Minidump path comes from the crashpad database, which Corvid
  // configures with uploads disabled (Phase 1.1 debrand-and-degoogle task). Symbolization runs locally via CrashSymbolizer.
  base::DictValue d;
  d.Set("reason", base::StringPrintf("%d", static_cast<int>(status)));
  d.Set("uploaded", false);
  d.Set("symbolizedSummary", "");
  d.Set("stack", base::ListValue());
  bus_->Emit({.kind = "crash", .severity = "fatal", .source = "renderer",
              .tab_id = TabIdFor(web_contents()), .data = std::move(d)});
}

void HangCollector::OnDidAddMessageToConsole(content::RenderFrameHost*,
                                             blink::mojom::ConsoleMessageLevel level,
                                             const std::u16string& message, int32_t line_no,
                                             const std::u16string& source_id,
                                             const std::optional<std::u16string>& stack) {
  base::DictValue d;
  using Level = blink::mojom::ConsoleMessageLevel;
  d.Set("level", level == Level::kVerbose ? "verbose" : level == Level::kInfo ? "info" : level == Level::kWarning ? "warning" : "error");
  d.Set("message", base::UTF16ToUTF8(message));
  d.Set("sourceUrl", base::UTF16ToUTF8(source_id));
  d.Set("line", line_no);
  if (stack) d.Set("rawStack", base::UTF16ToUTF8(*stack));
  bus_->Emit({.kind = "console", .severity = level == Level::kError ? "error" : level == Level::kWarning ? "warning" : "info",
              .source = "renderer", .tab_id = TabIdFor(web_contents()), .data = std::move(d)});
}

}  // namespace corvid::diagnostics
