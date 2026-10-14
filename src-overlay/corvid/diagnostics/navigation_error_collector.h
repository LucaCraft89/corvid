// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. Replaces the old net_collector.cc sketch. Why: in Chromium the network stack runs in the out-of-process
// network service, so a browser-process net::NetLog observer would not see page requests. NavigationHandle already
// carries what an error page needs (net error code, SSL info, resolve error info, timing), is stable public content API,
// and costs nothing for healthy navigations. Subresource failures are out of scope for 0.1.
// API names used (verify on the tree if the compile fails): content::NavigationHandle::{GetNetErrorCode, GetSSLInfo,
// GetResolveErrorInfo, GetURL, IsErrorPage, HasCommitted}, net::ErrorToShortString, net::X509Certificate.
#ifndef CORVID_DIAGNOSTICS_NAVIGATION_ERROR_COLLECTOR_H_
#define CORVID_DIAGNOSTICS_NAVIGATION_ERROR_COLLECTOR_H_

#include <string>

#include "base/memory/raw_ptr.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_contents_user_data.h"

namespace corvid::diagnostics {

class EventBus;

// Pure helper, unit tested without a browser: which stage failed, from a net error code (negative ints from
// net/base/net_error_list.h). Returns one of "dns", "connect", "tls", "timeout", "redirect", "http".
std::string PhaseForNetError(int net_error);
// True for certificate/TLS failures, which are reported as kind "tls" instead of "net_error".
bool IsTlsError(int net_error);

class NavigationErrorCollector : public content::WebContentsObserver,
                                 public content::WebContentsUserData<NavigationErrorCollector> {
 public:
  ~NavigationErrorCollector() override;
  void DidFinishNavigation(content::NavigationHandle* handle) override;

 private:
  friend class content::WebContentsUserData<NavigationErrorCollector>;
  explicit NavigationErrorCollector(content::WebContents* wc);
  raw_ptr<EventBus> bus_;
  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

}  // namespace corvid::diagnostics

#endif  // CORVID_DIAGNOSTICS_NAVIGATION_ERROR_COLLECTOR_H_
