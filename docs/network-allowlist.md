# Network allowlist

What the browser may contact on its own: fresh profile, no user action, idle.
`build/privacy-gate.sh` fails if it sees anything not listed here.

Format: one list item per entry, the host (or `*.domain`, an IPv4 address, or
`ip:port/proto`) in backticks first, then why it is allowed. Every entry
needs a reason a user would accept.

## Entries

(none)
