// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. See event_bus.h.
#include "corvid/diagnostics/event_bus.h"

#include <atomic>
#include <utility>

#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/time/time.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_contents_user_data.h"

namespace corvid::diagnostics {

namespace {

class TabId : public content::WebContentsUserData<TabId> {
 public:
  ~TabId() override = default;
  int id() const { return id_; }

 private:
  friend class content::WebContentsUserData<TabId>;
  explicit TabId(content::WebContents* wc)
      : content::WebContentsUserData<TabId>(*wc), id_(next_.fetch_add(1)) {}
  static std::atomic<int> next_;
  int id_;
  WEB_CONTENTS_USER_DATA_KEY_DECL();
};
std::atomic<int> TabId::next_{0};
WEB_CONTENTS_USER_DATA_KEY_IMPL(TabId);

std::string Serialize(const base::DictValue& d) {
  return base::WriteJson(d).value_or("{}");
}

}  // namespace

EventBus::EventBus(Retention retention)
    : ring_(retention), observers_(base::MakeRefCounted<base::ObserverListThreadSafe<Observer>>()) {}
EventBus::~EventBus() = default;

// static
EventBus* EventBus::Get() {
  static base::NoDestructor<EventBus> bus;
  return bus.get();
}

uint64_t EventBus::Emit(EventRecord record) {
  Event e;
  e.ts_ms = base::Time::Now().InMillisecondsSinceUnixEpoch();
  e.tab_id = record.tab_id;
  e.source = std::move(record.source);
  e.severity = std::move(record.severity);
  e.kind = std::move(record.kind);
  e.data_json = Serialize(record.data);
  Event copy;
  uint64_t id;
  {
    base::AutoLock l(lock_);
    id = ring_.Add(e);
    e.id = id;
  }
  copy = std::move(e);
  observers_->Notify(FROM_HERE, &Observer::OnEvent, copy);
  return id;
}

bool EventBus::Amend(uint64_t id, base::FunctionRef<void(base::DictValue&)> fn) {
  Event amended;
  {
    base::AutoLock l(lock_);
    bool ok = ring_.Update(id, [&](Event& e) {
      std::optional<base::Value> v = base::JSONReader::Read(e.data_json, base::JSON_PARSE_RFC);
      if (!v || !v->is_dict()) return;
      base::DictValue d = std::move(*v).TakeDict();
      fn(d);
      e.data_json = Serialize(d);
      amended = e;
    });
    if (!ok || amended.id == 0) return false;
  }
  observers_->Notify(FROM_HERE, &Observer::OnEvent, amended);
  return true;
}

std::vector<Event> EventBus::Snapshot() const {
  base::AutoLock l(lock_);
  return ring_.Snapshot();
}
void EventBus::SetRetention(Retention r) {
  base::AutoLock l(lock_);
  ring_.SetRetention(r);
}
void EventBus::Clear() {
  base::AutoLock l(lock_);
  ring_.Clear();
}

int TabIdFor(content::WebContents* wc) {
  if (!wc) return -1;
  TabId::CreateForWebContents(wc);
  return TabId::FromWebContents(wc)->id();
}

}  // namespace corvid::diagnostics
