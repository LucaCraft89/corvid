// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. See stack_sampler.h.
#include "corvid/diagnostics/stack_sampler.h"

#include <utility>

#include "base/no_destructor.h"
#include "base/task/single_thread_task_runner.h"

namespace corvid::diagnostics {

namespace {
StackSampler::Backend& BackendStorage() {
  static base::NoDestructor<StackSampler::Backend> backend;
  return *backend;
}
}  // namespace

base::ListValue FramesToValue(const std::vector<StackFrame>& frames) {
  base::ListValue out;
  for (const StackFrame& f : frames) {
    base::DictValue d;
    d.Set("fn", f.fn);
    if (!f.module.empty()) d.Set("module", f.module);
    if (!f.file.empty()) d.Set("file", f.file);
    if (f.line > 0) d.Set("line", f.line);
    if (!f.addr.empty()) d.Set("addr", f.addr);
    out.Append(std::move(d));
  }
  return out;
}

// static
void StackSampler::SetBackend(Backend backend) { BackendStorage() = std::move(backend); }

// static
void StackSampler::CaptureMainThread(content::RenderProcessHost* host, Callback callback) {
  Backend& backend = BackendStorage();
  if (!backend || !host) {
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(std::move(callback), std::vector<StackFrame>()));
    return;
  }
  backend.Run(host, std::move(callback));
}

}  // namespace corvid::diagnostics
