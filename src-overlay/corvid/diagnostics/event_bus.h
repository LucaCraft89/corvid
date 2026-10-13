// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT: written without a Chromium tree. Compile in dependency order (ring_buffer -> event_bus -> stack_sampler
<<<<<<< HEAD
// -> collectors). Chromium API names used here (base::Lock, base::ObserverListThreadSafe, base::Value::Dict,
=======
// -> collectors). Chromium API names used here (base::Lock, base::ObserverListThreadSafe, base::DictValue,
>>>>>>> origin/claude/busy-rubin-t8bloc
// base::WriteJson, base::NoDestructor, content::WebContentsUserData) are long-stable; verify only if the compile fails.
#ifndef CORVID_DIAGNOSTICS_EVENT_BUS_H_
#define CORVID_DIAGNOSTICS_EVENT_BUS_H_

#include <functional>
#include <string>
#include <vector>

#include "base/functional/function_ref.h"
#include "base/no_destructor.h"
#include "base/observer_list_threadsafe.h"
#include "base/synchronization/lock.h"
#include "base/thread_annotations.h"
#include "base/values.h"
#include "corvid/diagnostics/ring_buffer.h"

namespace content {
class WebContents;
}

namespace corvid::diagnostics {

// What collectors hand to Emit(). Field order matters: collectors use designated initializers.
struct EventRecord {
  std::string kind;      // "hang", "crash", "console", "net_error", "tls", ... (ui/diagnostics/types.ts Kind)
  std::string severity;  // "debug" | "info" | "warning" | "error" | "fatal"
  std::string source;    // "renderer", "browser", "network", ...
  int tab_id = -1;
<<<<<<< HEAD
  base::Value::Dict data;  // kind-specific payload, serialized once into Event::data_json
=======
  base::DictValue data;  // kind-specific payload, serialized once into Event::data_json
>>>>>>> origin/claude/busy-rubin-t8bloc
};

// Process-wide, thread-safe, local-only event hub. Emits write to a RingBuffer under a lock and then notify observers
// on their own sequences. No networking, no disk I/O here (a file-backed sink, if any, is an observer).
class EventBus {
 public:
  class Observer {
   public:
    virtual void OnEvent(const Event& event) = 0;
   protected:
    virtual ~Observer() = default;
  };

  explicit EventBus(Retention retention = {});
  ~EventBus();
  EventBus(const EventBus&) = delete;
  EventBus& operator=(const EventBus&) = delete;

  static EventBus* Get();  // lazily created, never destroyed

  // Returns the assigned id (never 0).
  uint64_t Emit(EventRecord record);
  // Re-serializes the payload of a retained event after fn edits it. False if the event was already evicted or its
  // payload is not a JSON object. Observers are told again with the amended event (same id).
<<<<<<< HEAD
  bool Amend(uint64_t id, base::FunctionRef<void(base::Value::Dict&)> fn);
=======
  bool Amend(uint64_t id, base::FunctionRef<void(base::DictValue&)> fn);
>>>>>>> origin/claude/busy-rubin-t8bloc

  std::vector<Event> Snapshot() const;
  void SetRetention(Retention r);
  void Clear();

  void AddObserver(Observer* o) { observers_->AddObserver(o); }
  void RemoveObserver(Observer* o) { observers_->RemoveObserver(o); }

 private:
  mutable base::Lock lock_;
  RingBuffer ring_ GUARDED_BY(lock_);
  scoped_refptr<base::ObserverListThreadSafe<Observer>> observers_;
};

// Stable per-tab id for events (0-based counter stored as WebContents user data). -1 for null.
int TabIdFor(content::WebContents* web_contents);

}  // namespace corvid::diagnostics

#endif  // CORVID_DIAGNOSTICS_EVENT_BUS_H_
