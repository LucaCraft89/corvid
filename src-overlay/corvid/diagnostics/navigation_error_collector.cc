// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. See navigation_error_collector.h. Payload shapes mirror ui/diagnostics/types.ts NetErrorData / TlsData.
#include "corvid/diagnostics/navigation_error_collector.h"

#include <utility>

#include "base/strings/string_number_conversions.h"
#include "base/time/time.h"
#include "base/values.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/web_contents.h"
#include "corvid/diagnostics/event_bus.h"
#include "net/base/net_errors.h"
#include "net/cert/x509_certificate.h"
#include "net/ssl/ssl_info.h"

namespace corvid::diagnostics {

WEB_CONTENTS_USER_DATA_KEY_IMPL(NavigationErrorCollector);

bool IsTlsError(int e) {
  return net::IsCertificateError(e) || (e <= net::ERR_SSL_PROTOCOL_ERROR && e > net::ERR_SSL_PROTOCOL_ERROR - 100) ||
         e == net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH || e == net::ERR_BAD_SSL_CLIENT_AUTH_CERT ||
         e == net::ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN;
}

std::string PhaseForNetError(int e) {
  switch (e) {
    case net::ERR_NAME_NOT_RESOLVED:
    case net::ERR_NAME_RESOLUTION_FAILED:
    case net::ERR_DNS_TIMED_OUT:
    case net::ERR_DNS_MALFORMED_RESPONSE:
<<<<<<< HEAD
    case net::ERR_DNS_SERVER_FAILED:
=======
    case net::ERR_DNS_SERVER_FAILURE:
>>>>>>> origin/claude/vm-builder-g3-g5
    case net::ERR_DNS_SERVER_REQUIRES_TCP:
    case net::ERR_DNS_SORT_ERROR:
      return "dns";
    case net::ERR_CONNECTION_TIMED_OUT:
    case net::ERR_TIMED_OUT:
      return "timeout";
    case net::ERR_TOO_MANY_REDIRECTS:
    case net::ERR_UNSAFE_REDIRECT:
      return "redirect";
    case net::ERR_CONNECTION_REFUSED:
    case net::ERR_CONNECTION_RESET:
    case net::ERR_CONNECTION_CLOSED:
    case net::ERR_CONNECTION_FAILED:
    case net::ERR_ADDRESS_UNREACHABLE:
    case net::ERR_INTERNET_DISCONNECTED:
    case net::ERR_NETWORK_CHANGED:
    case net::ERR_PROXY_CONNECTION_FAILED:
      return "connect";
    default:
      return IsTlsError(e) ? "tls" : "http";
  }
}

NavigationErrorCollector::NavigationErrorCollector(content::WebContents* wc)
    : content::WebContentsObserver(wc),
      content::WebContentsUserData<NavigationErrorCollector>(*wc),
      bus_(EventBus::Get()) {}
NavigationErrorCollector::~NavigationErrorCollector() = default;

void NavigationErrorCollector::DidFinishNavigation(content::NavigationHandle* handle) {
  if (!handle->IsInPrimaryMainFrame()) return;
  const net::Error code = handle->GetNetErrorCode();
  if (code == net::OK) return;                 // healthy navigations: zero ring-buffer writes
  if (code == net::ERR_ABORTED) return;        // user cancelled / superseded: not an error to report

  const int c = static_cast<int>(code);
  const std::string url = handle->GetURL().spec();
  const std::string name = net::ErrorToShortString(c);
  const int tab = TabIdFor(web_contents());

  if (IsTlsError(c)) {
    base::DictValue d;
    d.Set("url", url);
    d.Set("errorName", name);
    d.Set("hostname", handle->GetURL().host());
    base::ListValue chain;
    if (const std::optional<net::SSLInfo>& ssl = handle->GetSSLInfo(); ssl && ssl->cert) {
      // Leaf only for 0.1; intermediates via ssl->cert->intermediate_buffers() are a follow-up.
      base::DictValue cert;
      cert.Set("subject", ssl->cert->subject().GetDisplayName());
      cert.Set("issuer", ssl->cert->issuer().GetDisplayName());
      cert.Set("notBefore", static_cast<double>(ssl->cert->valid_start().InMillisecondsSinceUnixEpoch()));
      cert.Set("notAfter", static_cast<double>(ssl->cert->valid_expiry().InMillisecondsSinceUnixEpoch()));
      cert.Set("sha256", base::HexEncode(net::X509Certificate::CalculateFingerprint256(ssl->cert->cert_buffer())));
      chain.Append(std::move(cert));
    }
    d.Set("chain", std::move(chain));
    bus_->Emit({.kind = "tls", .severity = "error", .source = "network", .tab_id = tab, .data = std::move(d)});
    return;
  }

  base::DictValue d;
  d.Set("url", url);
  d.Set("errorCode", c);
  d.Set("errorName", name);
  d.Set("phase", PhaseForNetError(c));
  d.Set("timingsMs", base::DictValue());   // TODO(tree): fill from NavigationHandleTiming once the fields are verified
  d.Set("retries", base::ListValue());
  const net::ResolveErrorInfo& resolve = handle->GetResolveErrorInfo();
  if (resolve.error != net::OK) {
    base::DictValue r;
    r.Set("kind", "system");  // TODO(tree): distinguish DoH/custom once the resolver config is reachable here
    d.Set("resolver", std::move(r));
  }
  bus_->Emit({.kind = "net_error", .severity = "error", .source = "network", .tab_id = tab, .data = std::move(d)});
}

}  // namespace corvid::diagnostics
