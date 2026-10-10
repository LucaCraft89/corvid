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
