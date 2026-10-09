# Hybrid (caBLE v2) tunnel: policy, allow-list text, findings

## Decision (CR-5, 2026-10-09): option A
Use the existing upstream relays only when the user clicks "use your phone". Never at idle, never prefetched. A user setting turns hybrid off (phone-as-authenticator then does not work). A warning is shown before first use and in settings: the relay operator (Google or Apple) sees that a connection occurred and the IP address; the payload is end-to-end encrypted.

## Text for docs/network-allowlist.md (Phase 1 owns that file; paste this entry there)
| Host | Purpose | When contacted | Classification |
|---|---|---|---|
| `cable.ua5v.com` (Google) | Hybrid tunnel relay, wss | Only after user clicks "use your phone" with hybrid enabled | User-initiated exception; must NOT appear in idle capture |
| `cable.auth.com` (Apple) | Hybrid tunnel relay, wss | Same | Same |
| `cable.<hash>.{com,org,net,info}` | Other relays (domain id >= 256) | Same | Same; only if a phone selects one |

The idle-capture CI check must keep failing on these hosts; the passkeys acceptance run must show them only during the click-initiated flow.

## Findings from primary source
Source: `device/fido/cable/v2_handshake.cc` and `fido_tunnel_device.cc` on chromium/chromium main, fetched 2026-10-09 (not the pinned tree; re-verify on rebase).
- `tunnelserver::kAssignedDomains = {"cable.ua5v.com", "cable.auth.com"}` map to domain ids 0 and 1. (Which operator is which: ua5v.com is Google's, auth.com is Apple's, per the id order and metrics code in `fido_tunnel_device.cc` which records ids 0 and 1 separately; operator ownership is my inference, not stated in code.)
- Domain ids >= 256 are derived: `SHA256("caBLEv2 tunnel server domain" + id as u16 LE + NUL)`, first 8 bytes, low 2 bits choose TLD from {com, org, net, info}, remaining bits base32 encoded: `cable.<label>.<tld>`.
- The URL is built `wss://<domain>/cable/new/<id>` (new tunnel), `/cable/connect/<routing-id>/<tunnel-id>` and a contact URL for linked pairings. In the connect and linked paths the domain comes from the authenticator (phone) side data (`components.tunnel_server_domain`, `pairing->tunnel_server_domain`), so the phone, not the desktop, chooses the relay there. I did not verify who chooses it for the QR-initiated new-tunnel path.
- Custom relay feasibility: the protocol allows arbitrary relays only via the derived-domain space (ids >= 256), but the hostname is a fixed pseudo-random function of the id, so a self-hosted relay would need control of that exact public hostname (impractical) or a Corvid patch adding an override table in `DecodeDomain`. Even then a phone (Google Play Services / iOS) must choose that domain id; stock phones will keep using ids 0/1. Conclusion: a custom relay is technically possible on the desktop side with a small patch, but not useful with stock phones. Not implemented.
- No kill switch exists upstream beyond disabling the feature; Corvid's switch is `decideHybrid()` (`hybrid-policy.ts`), to be called from the discovery-factory hook before any BLE advert or WebSocket (UNVERIFIED wiring).
