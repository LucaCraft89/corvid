# Phase 0 verify report (linux)

- Date (UTC): 2026-10-09T23:24:38Z
- Mode: real
- Repo revision: b32ffad
- Pinned Chromium: 155.0.8059.39
- Host: Linux 7.2.8-200.fc44.x86_64 x86_64; cores: 24; RAM: 30 GB; free disk at CORVID_SRC parent: 884G
- Tools: python3=yes git=yes shellcheck=yes sccache=yes gn=no autoninja=no 

| Check | Result | Evidence (last lines) |
|---|---|---|
| `ci-patch-gate.sh` | SKIP | [test] SKIP: gate logic is exercised on the fixture tree only (run with --fixture)  |
| `clean-build.sh` | PASS | [corvid] headless launch OK [test] chrome --version: Corvid 155.0.8059.39  [test] PASS: version string contains 'Corvid'  |
| `idempotent-apply.sh` | PASS | render-branding: rendered 3 template(s) + icon into /home/luca/chromium/src [corvid] apply-patches OK (no .rej/.orig) [test] PASS: idempotent (state fa77a8247019008774048583bc7901256856c17b035f7aef49a |
| `lint.sh` | PASS | [test] PASS: 21 shell files clean under bash -n and shellcheck; python compiles  |
| `rebase-dry-run.sh` | PASS |  3. Rebuild, run `scripts/verify.sh --phase <N> --platform linux`, commit pin + patches + this report together. [test] PASS: report produced at /tmp/tmp.q4HZAAopYk/root/docs/rebase/155.0.8059.39.md (e |
| `refresh-roundtrip.sh` | SKIP | [test] SKIP: refresh round-trip is exercised on the fixture tree only  |
| `rename.sh` | PASS | [test] mode=real src=/home/luca/chromium/src [test] PASS: zero hits for 'corvid' outside credits after rename to Zebrafish  |

Totals: 5 pass, 0 fail, 2 skip.

## Log tails

### ci-patch-gate.sh (SKIP)

```
[test] SKIP: gate logic is exercised on the fixture tree only (run with --fixture)
```

### clean-build.sh (PASS)

```
[351470:351470:1010/012405.181597:WARNING:ui/aura/window.cc:1509] StackChildLayerRelativeTo called with unmanaged layer(s). child=WebContentsViewAura child_managed=0 target=WebContentsViewAura target_managed=0
[351470:351470:1010/012405.181900:WARNING:ui/aura/window.cc:1509] StackChildLayerRelativeTo called with unmanaged layer(s). child=WebContentsViewAura child_managed=0 target=WebContentsViewAura target_managed=0
[351470:351470:1010/012406.050935:ERROR:base/process/kill_posix.cc:33] waitpid(351507): No child processes (10)
[351470:351488:1010/012406.053278:WARNING:components/discardable_memory/service/discardable_shared_memory_manager.cc:466] Some MojoDiscardableSharedMemoryManagerImpls are still alive. They will be leaked.
[corvid] headless launch OK
[test] chrome --version: Corvid 155.0.8059.39 
[test] PASS: version string contains 'Corvid'
```

### idempotent-apply.sh (PASS)

```
[test] mode=real src=/home/luca/chromium/src
[corvid] tree reset to 155.0.8059.39
#     PATCH                                                   RESULT
[corvid] 0 patch(es) applied
[corvid] overlay: 89 file(s) copied
render-branding: rendered 3 template(s) + icon into /home/luca/chromium/src
[corvid] apply-patches OK (no .rej/.orig)
[test] PASS: idempotent (state fa77a8247019008774048583bc7901256856c17b035f7aef49a57162a0ffe2a1), no .rej/.orig
```

### lint.sh (PASS)

```
[test] PASS: 21 shell files clean under bash -n and shellcheck; python compiles
```

### rebase-dry-run.sh (PASS)

```
[test] mode=real src=/home/luca/chromium/src
[corvid] latest stable per versionhistory API: 155.0.8059.39
[corvid] fetch: version=155.0.8059.39 mode=full src=/home/luca/chromium/src
[corvid] gclient sync at 155.0.8059.39


Warnings:
git update is recommended.
Installed git version is 2.43.0;
depot_tools recommends version 2.46.0 or later.
Disable this warning by setting the GCLIENT_SUPPRESS_GIT_VERSION_WARNING
environment variable to 1.
[corvid] fetch done
[corvid] wrote /tmp/tmp.q4HZAAopYk/root/docs/rebase/155.0.8059.39.md
[corvid] CHROMIUM_VERSION -> 155.0.8059.39
[corvid] summary: 0 patches: 0 clean, 0 fuzz, 0 conflict
# Chromium rebase report: 155.0.8059.39 -> 155.0.8059.39

- Date: 2026-10-09
- Scratch branch: `corvid/rebase-155.0.8059.39` in `CORVID_SRC`
- Patches: 0 total, 0 clean, 0 fuzz, 0 conflict
- Pin file updated to the new tag

The series is empty; there was nothing to rebase. Pin movement only.

## Next steps

3. Rebuild, run `scripts/verify.sh --phase <N> --platform linux`, commit pin + patches + this report together.
[test] PASS: report produced at /tmp/tmp.q4HZAAopYk/root/docs/rebase/155.0.8059.39.md (exit 0)
```

### refresh-roundtrip.sh (SKIP)

```
[test] SKIP: refresh round-trip is exercised on the fixture tree only
```

### rename.sh (PASS)

```
[test] mode=real src=/home/luca/chromium/src
[test] PASS: zero hits for 'corvid' outside credits after rename to Zebrafish
```
