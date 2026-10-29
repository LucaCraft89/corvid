# 001: Patch base for Corvid (phase 0, 2026-10-29)

**Decision (owner confirmed 2026-10-29, whole project is GPL-3.0): base the desktop browser on Helium's patch set (`imputnet/helium-chromium`).** Our own work is a patch series applied after Helium's. Never a fork of the Chromium tree.

## Findings (read from the repos, shallow clones, not built)
| Base | Licence | Chromium | Platforms | Notes |
|---|---|---|---|---|
| helium-chromium | **GPL-3.0** (its own code and patches); imported ungoogled parts stay BSD-3 | 156.0.8078.73 (rev 2) | Linux, Windows, macOS via separate repos (`helium-linux`, `-windows`, `-macos`) | 370 patches in `patches/series`. Branched from ungoogled-chromium; also carries patches from Inox, Debian, Bromite, Iridium, Brave. **No Android.** |
| ungoogled-chromium | BSD-3-Clause | 156.0.8078.73 | Linux, Windows, macOS; Android is a separate repo (`ungoogled-chromium-android`, not inspected) | Smaller base, we would redo Helium's UX work. |
| cromite | **GPL-3.0** | not read | **Android (arm64, arm32, x86_64, Android 10+), Windows, Linux** | Built-in ad blocker. A different patch lineage from Helium. |

- **Sync already exists in Helium's series** (about 9,000 patch lines, GPL, copyright 2026): `helium/core/sync/` has a vault format, vault encryption, transport, store, engine backend and a provider API, and `disable-google-backed-sync-integrations`. Not verified: whether it works end to end, which server it talks to (probably `imputnet/helium-services`), and whether it ships in a release. Phases 4 and 7 must start from this, not from a blank spec.
- **uBlock Origin is wired in** (`ublock-*` patches, `imputnet/uBlock` fork as a component). Helium's patched uBO is a fork, while PROJECT.md wants the unmodified upstream.
- **MV2:** the series includes `ungoogled-chromium/extensions-manifestv2.patch` (removes the deprecation UI). Not verified that MV2 still runs in Chromium 156; test in phase 6.
- Helium's `AGENTS.md` bans AI-written contributions upstream. So: no PRs to imputnet repos from us, ever.

## Consequences
1. **Licence: the whole project is GPL-3.0-or-later** (owner decision, 2026-10-29), because the base is GPL-3.0. PROJECT.md principle 9 updated. New files carry a GPL-3.0 header; imported BSD-3 code (ungoogled-chromium, Chromium) keeps its own licence and notice.
2. PROJECT.md says "Chromium 155"; the base is on 156. Follow the base's version.
3. Android needs a different base (Cromite, or ungoogled-chromium-android). Two patch lineages means double the rebase work. Decide in phase 9.
4. Hardware: dev VM is 20 vCPU Westmere, 96 GB RAM, 203 GB disk. Enlarge to 400 GB before Android.
