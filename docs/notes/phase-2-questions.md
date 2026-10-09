# Phase 2 open questions for the user (not decided by the agent)

| # | Question | Default shipped (configurable) | Where it lives |
|---|---|---|---|
| Q1 / CR-5 | Hybrid passkey transport needs a tunnel server host. Use upstream default hosts, a configurable host, or disable hybrid? | Nothing decided; hybrid left as upstream code, flagged in the manual checklist | docs/security/passkeys.md gap 7 |
| Q2 | Vault unlock policy: passphrase each session, OS keyring, or both? | All three modes implemented; UI default is passphrase (safest, no OS dependency). Auto-lock idle = 5 min | `UnlockMode`, `VaultService({idleMs})` |
| Q3 | Diagnostics retention size | 32 MiB, 50,000 events, 7 days, whichever hits first | `DEFAULT_RETENTION` (types.ts), `Retention` (ring_buffer.h) |
| Q4 | Argon2id cost | m=64 MiB, t=3, p=1 | `DEFAULT_KDF` (vault.ts) |
| Q5 | Which "two major sites" for passkey acceptance? | none chosen | passkeys-manual.md |
| Q6 | Should export redaction default to ON? | ON (privacy-safe) | `HubModel.redact` |
| Q7 | Dependencies: noble-hashes/ciphers/curves (MIT), typescript+@types/node (Apache-2.0/MIT, dev only). OK? | used | docs/notes/phase-2-dependencies.md |
