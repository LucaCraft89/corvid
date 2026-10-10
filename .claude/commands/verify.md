---
description: Run the portable checks and the real-tree Phase 0 verification and summarize honestly
---
Run `npm run check`, `scripts/overlay-selfcheck.sh`, and (if CORVID_SRC exists) `scripts/verify.sh --phase 0 --platform linux`. Report each as PASS/FAIL/SKIPPED with the key output line. If anything fails, show the first real error and propose the smallest fix; do not weaken tests.
