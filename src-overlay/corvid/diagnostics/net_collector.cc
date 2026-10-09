// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNVERIFIED (uncompiled) sketch. Net collector: a net::NetLog::ThreadSafeObserver (capture mode
// kDefault, never kEverything: no cookies/headers/bodies) filtering these event types and folding
// them per URLRequest source id into one kNetError / kTls event when the request fails:
//   HOST_RESOLVER_DNS_TASK / HOST_RESOLVER_MANAGER_JOB  -> resolver, addresses, dns timing
//   TCP_CONNECT, SOCKET_ALIVE                           -> connect timing, refused/timeout
//   SSL_CONNECT / SSL_CERTIFICATES_RECEIVED / CERT_VERIFIER_JOB -> chain + verifier error
//   URL_REQUEST_REDIRECTED / URL_REQUEST_RETRY          -> redirect chain, retries
// Observer is added only while the diagnostics service is enabled; with no failing requests the
// per-event cost is one enum compare. Overhead is NOT measured (acceptance test 4 UNVERIFIED).
//
// Design note: events are folded in-process and emitted only on failure/completion-with-error, so
// healthy traffic produces zero ring-buffer writes.
#include "corvid/diagnostics/event_bus.h"
#include "net/log/net_log.h"
#include "net/log/net_log_event_type.h"

namespace corvid::diagnostics {

class NetCollector : public net::NetLog::ThreadSafeObserver {
 public:
  explicit NetCollector(EventBus* bus) : bus_(bus) {}
  void OnAddEntry(const net::NetLogEntry& entry) override;
 private:
  struct Pending;  // per-source accumulated timings/chain; erased on URL_REQUEST end
  EventBus* bus_;
};

}  // namespace corvid::diagnostics
