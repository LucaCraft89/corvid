// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. Main-thread stack capture for a hung renderer. docs/notes/chromium-hooks.md: the browser process cannot
// sample another process with base::StackSamplingProfiler, so the real backend is a platform-specific capture
// (crashpad dump-without-crash of the renderer, or a renderer-side sampler reached over Mojo). The backend is
// therefore injectable. Until one is registered, CaptureMainThread reports "no stack" (stackCaptured=false), which
// the hang event already represents; the hang event itself is never delayed or lost.
#ifndef CORVID_DIAGNOSTICS_STACK_SAMPLER_H_
#define CORVID_DIAGNOSTICS_STACK_SAMPLER_H_

#include <cstdint>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/values.h"

namespace content {
class RenderProcessHost;
}

namespace corvid::diagnostics {

// Mirrors ui/diagnostics/types.ts StackFrame.
struct StackFrame {
  std::string fn;
  std::string module;
  std::string file;
  int line = 0;
  std::string addr;
};

base::Value::List FramesToValue(const std::vector<StackFrame>& frames);

class StackSampler {
 public:
  using Callback = base::OnceCallback<void(std::vector<StackFrame>)>;
  using Backend = base::RepeatingCallback<void(content::RenderProcessHost*, Callback)>;

  // Always runs `callback` asynchronously exactly once (empty vector on failure or no backend).
  static void CaptureMainThread(content::RenderProcessHost* host, Callback callback);

  // Registers the platform backend; pass a null callback to clear. Test seam as well.
  static void SetBackend(Backend backend);
};

}  // namespace corvid::diagnostics

#endif  // CORVID_DIAGNOSTICS_STACK_SAMPLER_H_
