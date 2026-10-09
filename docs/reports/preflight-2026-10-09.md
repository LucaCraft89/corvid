# Preflight 2026-10-09

Host: Fedora 44 (kernel 7.2.8), AMD Ryzen 9 7900X (12c/24t), RTX 4070, 31.9 GB RAM (MemTotal 31928108 kB), 1.1 TB free on /home (ext/btrfs local NVMe).

| Check | Result |
|---|---|
| nproc | 24 PASS |
| RAM >= 32 GB | FAIL by a hair: 31.9 GB total (~30.4 GiB). User is gaming concurrently (~12 GB available). Build must use low CORVID_JOBS; fetch is fine. |
| Disk >= 150 GB | PASS (1.1 TB) |
| git/python3 3.14/node 24.18 | PASS |
| go | installed via dnf: go1.26.8 PASS |
| `npm ci && npm run check` | PASS (134/134) |
| `scripts/overlay-selfcheck.sh` | PASS (23 tests, 0 failed) |
| shellcheck, sccache | installed via dnf |
| install-build-deps.sh | not usable (Debian-only); Fedora equivalents installed via dnf |
| depot_tools | cloned; needed `update_depot_tools` run once from inside ~/depot_tools because fetch.sh sets DEPOT_TOOLS_UPDATE=0 before bootstrap (script bug, to fix) |
