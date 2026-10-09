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
# (none yet)
```

## Change process

Adding a host requires a reason, the feature it belongs to, and whether it is contacted only after explicit user opt-in. Anything contacted without opt-in at idle needs the user's approval (privacy is a locked decision).
