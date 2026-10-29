# AGENTS.md (read first, every session)

Corvid: a Chromium browser built as a **patch series on top of Helium's patches** (see `docs/PROJECT.md` for the product, `docs/decisions/` for choices, `docs/PHASES.md` for the plan, `docs/STATUS.md` for where we are).

## Rules
- Never fork the Chromium tree. Our changes are small patches under `patches/`. Keep the count low; every patch costs a rebase every 4 weeks.
- One change at a time: build, run, test, then the next. A change that was not run is not done.
- Never report something as working unless you ran it and can show the output. Skipped checks are reported as skipped.
- Verify facts about Helium, ungoogled-chromium, Cromite and Chromium versions from their repos, not from memory.
- Dev VM: 20 vCPU Westmere (no AVX), 96 GB RAM. Use a component build, `symbol_level=0`, ccache, no LTO. Release builds (LTO/PGO) go to CI or a rented machine.
- No secrets in git. Plain words in user-facing text. The product name lives in one place.
- Do not send pull requests to imputnet or other upstream repos.
- Last action of a session: update `docs/STATUS.md` (done / next / gotchas / exact commands) and commit.
