// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT / UNRUN. Tests the pure mapping helpers.
#include "corvid/diagnostics/navigation_error_collector.h"

#include "net/base/net_errors.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::diagnostics {

TEST(CorvidNavigationErrorTest, PhaseMapping) {
  EXPECT_EQ(PhaseForNetError(net::ERR_NAME_NOT_RESOLVED), "dns");
  EXPECT_EQ(PhaseForNetError(net::ERR_CONNECTION_REFUSED), "connect");
  EXPECT_EQ(PhaseForNetError(net::ERR_CONNECTION_TIMED_OUT), "timeout");
  EXPECT_EQ(PhaseForNetError(net::ERR_TOO_MANY_REDIRECTS), "redirect");
  EXPECT_EQ(PhaseForNetError(net::ERR_CERT_DATE_INVALID), "tls");
  EXPECT_EQ(PhaseForNetError(net::ERR_FILE_NOT_FOUND), "http");
}

TEST(CorvidNavigationErrorTest, TlsClassification) {
  EXPECT_TRUE(IsTlsError(net::ERR_CERT_AUTHORITY_INVALID));
  EXPECT_TRUE(IsTlsError(net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH));
  EXPECT_FALSE(IsTlsError(net::ERR_NAME_NOT_RESOLVED));
  EXPECT_FALSE(IsTlsError(net::OK));
}

}  // namespace corvid::diagnostics
