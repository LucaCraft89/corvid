# Network allow-list

Hosts Corvid may contact from a **clean profile while idle** (acceptance check 1). The list is initially empty: an idle Corvid contacts nothing.

User-initiated traffic is outside this list: page navigation the user requested, and extension update checks to the source the user configured (the idle test does not trigger either).

The machine-readable block below is parsed by `tests/acceptance/phase-1/lib/allowlist.mjs`. One entry per line: `host-or-*.suffix  # reason`. Blank lines and `#` comments are ignored. Loopback and link-local addresses, and `localhost`, are always ignored by the checker.

```allowlist
# (empty)
```

## Allowed binary strings

Google hostnames that may appear in the built binary/resources (for example a search-provider entry the user can select). Parsed by `01b-binary-host-grep.sh`.

```binary-allowlist
# Everything else is rewritten to <host>.invalid at build time by scripts/domain-substitute.py (unresolvable, fails closed).
# Google web search as a user-selectable search provider (never contacted unless the user picks it and searches).
www.google.com
google.com
# Chrome Web Store as a user-selectable extension source (install/update only on user action; docs/extension-sources.md).
chromewebstore.google.com
chrome.google.com
clients2.google.com
clients2.googleusercontent.com
```

### Scoped binary strings (approved by Luca, 2026-10-12: "allow A, B, C")

Hosts that appear in the binary only as data, allowed by *where* they sit, not by name. Parsed by `01b-binary-host-grep.sh`: one rule per line, `file-glob  host-glob  # reason`, matched against the per-file report from `scripts/binary-host-report.sh`. A host found in any file or form not matched here still fails the check.

```binary-scoped
# A. HSTS preload and key-pin lists (transport_security_state_static). Data saying "use HTTPS for this host"; nothing is contacted. scripts/domain-substitute.py skips it on purpose, rewriting would corrupt the list. Limit: this also allows any other Google host string inside libnet.so.
libnet.so  *
# B. Protobuf Any type-URL prefix: an identifier, never connected to.
*  type.googleapis.com
# C. Help links and bundled page text in resource packs. Followed only if the user clicks a link in a page; the stock pages are hidden by the stock-page rewriter. Limit: this also allows any Google host string in the packs.
*.pak  *
# D. Links and identifiers found by tracing the string in the binary (approved by Luca, 2026-10-13: "yes allowlist"). None is fetched at idle.
# Link URLs shown to the user (a user click is needed to follow them): password_manager_util.cc settings link, autofill/wallet privacy link.
chrome  wallet.google.com
chrome  policies.google.com
# Payment Request method identifiers in payment_request.cc (compared as strings; only matter if a site requests those methods).
libblink_modules.so  pay.google.com
libblink_modules.so  play.google.com
# Console warning text in document.cc (document.write intervention).
libblink_core.so  developers.google.com
# XMP namespace URIs inside Skia (http://ns.google.com/photos/1.0/container/...): identifiers, never fetched.
libskia.so  ns.google.com
# E. String-only hits found by tracing (approved by Luca, 2026-10-13: "yes allowlist 3"). Nothing here is a connection target.
# Bare ".google.com": Content-Security-Policy strings for stock WebUI pages (frame-src/child-src https://*.google.com) and a domain suffix next to "crash-reporting".
chrome  .google.com
libcontent.so  .google.com
# Log text: "PSA: https://groups.google.com/g/discuss-webrtc/..." (VP9 quality scaling message).
libthird_party_webrtc_overrides_webrtc_component.so  groups.google.com
# Not a host: "show_tab_groups" immediately followed by "google.com/recapimage/..."; two adjacent strings in the string pool.
chrome  groupsgoogle.com
```

## User-initiated exceptions

Hosts that may be contacted **only as the direct result of an explicit user action** (never in the idle capture, which must stay empty). Parsed by the acceptance scripts that exercise those actions.

```user-initiated
# Widevine CDM component, only after the user accepts the Corvid DRM prompt (CR-11 open; see docs/notes/widevine.md).
# Hostnames are NOT verified: confirm against the pinned Chromium's component updater URL constants before use.
# (none confirmed yet)
```

Extension sources the user has configured (Chrome Web Store, Microsoft Edge Add-ons by default, plus any added store) are contacted only to install from them or to update an extension installed from them. See docs/extension-sources.md.

## Change process

Adding a host requires a reason, the feature it belongs to, and whether it is contacted only after explicit user opt-in. Anything contacted without opt-in at idle needs the user's approval (privacy is a locked decision).
