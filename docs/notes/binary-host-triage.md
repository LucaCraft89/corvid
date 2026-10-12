# Binary host-string triage (G2, 2026-10-12)

Source: PC report `binary-host-report.tsv` (out/Shared, Debug component build, after domain substitution, with 0196/0197): 170 Google-service hosts, 164 not on the binary allowlist, so `01b-binary-host-grep.sh` fails. Grouped by where the string sits (script: `scripts/binary-host-report.sh`). The grouping is from file names only; the source of each string was NOT traced, so the "why" column is inference.

| Group | Hosts | Where | Why (inference) | Proposal |
|---|---|---|---|---|
| A. HSTS / key-pin preload data | 49 only in `libnet.so`, about 14 more that also appear elsewhere in small counts (66 hosts in libnet.so total) | `libnet.so` | `transport_security_state_static`: the substitution script skips it on purpose (rewriting would corrupt the HSTS list). It says "use HTTPS for this host", nothing is contacted | allow as data, scoped to `libnet.so` |
| B. Protobuf type URL | `type.googleapis.com` (181 hits, 40 in `chrome`) | all | `Any` type-URL prefix, an identifier, never connected to | allow |
| C. Strings and links in resource packs | 80 hosts only in `resources.pak` / `content_shell.pak` | `*.pak` | help/learn-more links and bundled WebUI/third_party JS text; the pages are hidden by the stock-page rewriter | allow scoped to `*.pak`; a link is followed only by a user click |
| D. In code, several libs | `gemini*.google.com` x5, `docs`, `support`, `policies`, `wallet`, `www.googleapis.com`, `developers`, `.google.com`, `play`, `pay` | `chrome`, `libblink_*`, `libbrowser_ui_views`, ... | probably one shared host table (Gemini/Google-owned-domain lists), not traced | needs tracing; patch if it is a live endpoint |
| E. gRPC / quiche / skia / trace processor | `directpath-pa`, `iam`, `oauth2`, `traffic-director-c2p.xds` (libgrpc++), `ipprotection-ppissuer` (quiche blind sign), `ns.google.com` (skia XMP namespace), `storage.googleapis.com` (test trace processor) | named libs | library defaults / identifiers; unlikely to run at idle | trace each; most are identifiers |

The substitution script skips `third_party`, test, docs and `transport_security_state` paths (`scripts/domain-substitute.py` SKIP_PARTS), which explains groups A, E and part of C. Not measured: how many of the 164 come from skipped dirs.

The privacy gate is the idle capture (0 connections), which passes; the string grep is a hygiene proxy. Adding hosts to `docs/network-allowlist.md` needs the user's approval (CLAUDE.md rule 3).
