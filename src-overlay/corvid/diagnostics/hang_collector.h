// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// NOT BUILT YET (needs event_bus.h and stack_sampler.h, Phase 2). WebContentsObserver signatures were checked against
// content/public/browser/web_contents_observer.h @155 (docs/notes/chromium-api-m2.md).
#ifndef CORVID_DIAGNOSTICS_HANG_COLLECTOR_H_
#define CORVID_DIAGNOSTICS_HANG_COLLECTOR_H_

#include "base/memory/raw_ptr.h"
#include <optional>
#include <string>

#include "base/process/kill.h"
#include "base/time/time.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_contents_user_data.h"
#include "third_party/blink/public/mojom/devtools/console_message.mojom-forward.h"

namespace corvid::diagnostics {

class EventBus;

// Per-tab. Listens to the existing renderer-unresponsive path (no new IPC, no polling) so idle cost
// is zero. On unresponsive: emits kHang immediately (<5s budget is the hang monitor's own 5s
// threshold minus nothing: the event is emitted at the first notification) and asks the stack
// sampler for a main-thread stack. On responsive again: emits recovery with duration.
class HangCollector : public content::WebContentsObserver,
                      public content::WebContentsUserData<HangCollector> {
 public:
  ~HangCollector() override;
  // content::WebContentsObserver:
  void OnRendererUnresponsive(content::RenderProcessHost* host) override;
  void OnRendererResponsive(content::RenderProcessHost* host) override;
  void PrimaryMainFrameRenderProcessGone(base::TerminationStatus status) override;
  void OnDidAddMessageToConsole(content::RenderFrameHost* source,
                                blink::mojom::ConsoleMessageLevel level,
                                const std::u16string& message, int32_t line_no,
                                const std::u16string& source_id,
                                const std::optional<std::u16string>& untrusted_stack_trace) override;

 private:
  friend class content::WebContentsUserData<HangCollector>;
  explicit HangCollector(content::WebContents* web_contents);
  base::TimeTicks hang_started_;
  raw_ptr<EventBus> bus_;
  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

}  // namespace corvid::diagnostics

#endif  // CORVID_DIAGNOSTICS_HANG_COLLECTOR_H_
