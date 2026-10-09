---
name: verify-phase
description: Run the acceptance checks for the current roadmap phase and produce a pass/fail report. Use at the end of every task and before declaring a phase complete.
---

# verify-phase

## Steps
1. Read the current phase section in `docs/ROADMAP.md` and its spec `docs/specs/phase-N.md` (acceptance tests listed there).
2. Run `scripts/verify.sh --phase N --platform <platform>`. It must: apply the series on a fresh checkout, build, run unit and browser tests, and run the phase's acceptance scripts in `tests/acceptance/phase-N/`.
3. Write `docs/reports/phase-N-<platform>-<date>.md`: each check, pass/fail, evidence (log excerpts, screenshots, capture file names).
4. On any failure: do not mark the phase complete; open a task for each failure with the failing command and output.
5. Re-run earlier phases' checks too (regression); a later phase must not break earlier acceptance.

## Done when
- Every check passes on the platform in scope, or the report lists each failure with a next step. Never mark complete on partial passes.

## Rules
- Do not weaken a test to make it pass. If a test is wrong, change it in a separate commit with an explanation.
- Network-sensitive checks (idle capture) must run in a clean profile.
