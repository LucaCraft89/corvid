# Phase 2 decisions (user answers, 2026-10-09)

| # | Topic | Decision (2026-10-09) | Where implemented |
|---|---|---|---|
| Q1 / CR-5 | Hybrid tunnel host | APPROVED option A: use the existing Google/Apple-operated relays, only when the user clicks "use your phone", never at idle. User setting to turn hybrid off. Warning shown before first use and in settings. See `hybrid-tunnel.md` | `hybrid-policy.ts` + `policy.test.ts`; strings `hybrid.*` in `ui/pages/diagnostics/i18n/en.json` |
| Q2 | Vault unlock | OS keyring (Secret Service / libsecret) is the default. Passphrase is an optional extra (`passphrase+keyring`) or the fallback when no keyring exists. No unprotected vault is ever created | `VaultService.defaultMode`, `policy.test.ts`, `VaultModel.create` |
| Q3 | Diagnostics retention | 32 MiB, 50,000 events, 7 days: confirmed | `DEFAULT_RETENTION`, `Retention` |
| Q4 | Argon2id | m=64 MiB, t=3, p=1: confirmed | `DEFAULT_KDF` |
| Q5 | Passkey test sites | webauthn.io, Google (covers YouTube sign-in), GitHub | `tests/acceptance/phase-2/passkeys-manual.md` |
| Q6 | Export redaction | ON by default (URLs, paths, IPs); user may turn it off after seeing the preview | `HubModel.redact = true`; exporter tests |
| Q7 | Dependencies | noble libs (MIT), typescript/@types/node (dev): not objected to; see phase-2-dependencies.md | |

Still open: Linux keyring availability fallback UX wording; whether auto-lock (5 min) should apply to keyring-only vaults.
