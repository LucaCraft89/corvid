---
description: Author and verify one M3 patch group (G1..G5)
argument-hint: <G1|G2|G3|G4|G5>
---
Do M3 group $ARGUMENTS from `docs/CLAUDE-CODE-PLAN.md`. Load `skills/add-patch/SKILL.md` and the group's skills. For each patch: find the real symbols in the tree (use the `chromium-researcher` agent for broad searches), make the minimal change, generate the hunks with `scripts/refresh-patches.sh`, apply on a fresh tree, build, smoke-test. Then run the group's gate, move the patches into `patches/series`, run the Phase 0 regression, write the report with `/milestone-report M3-$ARGUMENTS`.
