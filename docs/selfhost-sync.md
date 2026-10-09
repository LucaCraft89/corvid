# Self-hosting Corvid Sync

Status: threat model approved by the user 2026-10-09 (`docs/security/sync.md`); implementation not yet production-verified. Verified locally: the server binary runs and passes the acceptance suite; the LXC install script works into a staging root. NOT verified: the container image build, the compose stack, a real systemd/LXC start.

The server stores only ciphertext. It never sees your passphrase, recovery key, URLs, titles, passwords or passkeys. It does see: your account name, device names, how many records you have per collection, their rough sizes and when they change, and your IP address.

## 1. Quick start (compose + Caddy for TLS)

```sh
cd server/sync
cp .env.example .env        # set SYNC_DOMAIN and a long random CORVID_SYNC_REG_TOKEN
docker compose up -d
curl https://$SYNC_DOMAIN/v1/info
```

In Corvid open `corvid://sync`, enter `https://<your domain>`, choose "Create account", and paste the invite token. Save the recovery key it shows (once!).

TLS is required in practice: tokens are bearer tokens. The server itself speaks plain HTTP on :8443 and must only be reachable through your reverse proxy. Set `CORVID_SYNC_TRUST_PROXY=1` only if the proxy is the sole path in (otherwise clients can spoof their IP and dodge rate limits).

Without Docker: `cd server/sync && go build ./cmd/corvid-sync && ./corvid-sync -data ./data -registration-token <token> -addr 127.0.0.1:8443`.

## 1b. Proxmox LXC or bare metal (systemd, no Docker)

The same static binary (no CGO, no libc dependency). Tested here: the install script into a staging root (`DESTDIR`) and the binary itself. NOT tested: a real Proxmox LXC or systemd start (no systemd in the build sandbox).

1. In Proxmox create an unprivileged Debian/Ubuntu LXC (512 MB RAM and 4 GB disk is plenty; no nesting, no keyctl, no extra features needed). Give it a static IP or DHCP reservation.
2. Copy `server/sync/` into the container (or just the built binary plus `server/sync/deploy/`). Build on any machine with `cd server/sync && CGO_ENABLED=0 go build -trimpath -o corvid-sync ./cmd/corvid-sync` (cross-compile with `GOOS=linux GOARCH=arm64` for ARM hosts).
3. In the container: `sudo server/sync/deploy/install.sh ./corvid-sync`. It creates the unprivileged `corvid-sync` user, `/var/lib/corvid-sync` (0700), `/etc/corvid-sync/env` (0640, generated invite token printed once), installs `corvid-sync.service` (hardened: no capabilities, read-only system, private tmp) and starts it on `127.0.0.1:8443`. `LISTEN=0.0.0.0:8443` makes it LAN-reachable.
4. TLS: install Caddy/nginx/Traefik in the same or another container and proxy to `:8443`; or use Proxmox's usual reverse proxy. Set `CORVID_SYNC_TRUST_PROXY=1` in `/etc/corvid-sync/env` only if that proxy is the sole way in.
5. Backups: snapshot the container (Proxmox backup) while the service is stopped, or back up `/var/lib/corvid-sync` (see section 3). Upgrades: replace `/usr/local/bin/corvid-sync`, `systemctl restart corvid-sync`.

## 1c. What syncs
Bookmarks, passwords, passkeys, settings, themes, layouts/customisations/modules, extensions (installed list and their settings, not code or extension storage), history (toggle, on by default). Open tabs: optional, off by default. **Cookies never sync.** Every collection has a toggle in `corvid://sync`. Names of collections, record counts, sizes and timing are visible to the server; contents are not.

## 1d. New devices and recovery (strict model)
There is no passphrase-wrapped key copy on the server. To add a device: sign in on it (it shows a short code), then approve it on a device you already trust after checking both codes match. If you lose every trusted device, use the recovery key (shown once at account creation). If you lose all trusted devices AND the recovery key, the data cannot be recovered by anyone, including the server operator.

## 1e. Optional admin UI
Off by default. Set `CORVID_SYNC_ADMIN_TOKEN` (a long random string) to enable `/admin`: create invite tokens, list users and quotas, set quotas, list/block devices, health. Metadata only; it cannot read data or keys and cannot approve devices. Do not expose `/admin` publicly: restrict it at your reverse proxy (LAN only or client-cert/basic auth) in addition to the token.

## 2. Configuration

| Env / flag | Default | Meaning |
|---|---|---|
| `CORVID_SYNC_ADDR` / `-addr` | `:8443` | listen address |
| `CORVID_SYNC_DATA` / `-data` | `/data` | holds `sync.db` (+ `-wal`, `-shm`) and `server-keys.json` |
| `CORVID_SYNC_REGISTRATION` / `-registration` | `token` | `open`, `closed`, or `token` (invite token required) |
| `CORVID_SYNC_REG_TOKEN` / `-registration-token` | none | invite token |
| `CORVID_SYNC_TRUST_PROXY` | off | trust `X-Forwarded-For` |
| `-quota-mb` | 100 | default per-account stored ciphertext (admin UI can override per user) |
| `CORVID_SYNC_ADMIN_TOKEN` | unset (admin UI off) | enables `/admin` |

Built-in limits (edit `syncserver.Config`): 2 MiB request body, 256 KiB record, 200 records per push, 20 devices per account, 600 requests/min/IP, 30 auth requests/min/IP, 90 day tombstone retention, 30 day sessions. Recommended: `registration=closed` after you have created your accounts.

Postgres is not implemented yet; SQLite handles a homelab easily (single writer connection, WAL).

## 3. Backup and restore

Back up the **whole data directory**, especially `server-keys.json`. If that file is lost, every account's login stops working (the OPAQUE keys are in it); data stays encrypted and recoverable only via each user's recovery key, which requires re-registering. Treat the key file like a TLS private key: mode 0600, not in public backups. A stolen database alone does not reveal data or allow offline passphrase guessing; a stolen database plus key file allows (Argon2id-slowed) guessing of weak passphrases.

Simplest and tested (`TestBackupRestoreByCopy`): stop the container (`docker compose stop sync`), copy the data volume (`sync.db` and `server-keys.json`), start it again. A hot backup with `sqlite3 sync.db ".backup file"` (plus copying `server-keys.json`) should also work, but is not covered by a test.

Restore: stop the server, put `sync.db` and `server-keys.json` back into the data directory (delete stale `sync.db-wal` / `-shm`), start it. After restoring an OLD backup, clients that had already seen newer data will refuse to sync and report "the server's data went backwards" (rollback protection, tested against a faulty server). Recovery from that state (re-trusting the restored server) is not implemented yet: today the fix is to sign the device out and sign in again. Restoring the latest backup after a disk loss is the supported case.

## 4. Upgrades

1. Back up (section 3).
2. `git pull && docker compose build && docker compose up -d`.
3. The server checks the database schema version at start and refuses to run on a schema it does not know (it never migrates silently); release notes will say when a migration is needed and provide the command. Current schema: 1.
4. Roll back by restoring the backup and the previous image tag.

Protocol compatibility: the API is `/v1`. Clients and server must both be v1; a future v2 will be served side by side.

## 5. Operating notes

- Health: `GET /healthz`; metrics are deliberately not exposed (no telemetry). Logs contain no bodies, tokens or passphrases.
- Tombstones are compacted every 6 h after 90 days. A device offline longer than that will be told to do a full resync.
- Rate limits are per client IP; behind a proxy, make sure the proxy sets `X-Forwarded-For` and `TRUST_PROXY=1`.
- To remove a user's data: they use "Delete account" in `corvid://sync` (or `DELETE /v1/account`).
- Lost passphrase, still have a trusted device: change it there (the passphrase protects only your login, never your data keys). Lost passphrase and devices: use the recovery key. Lost the devices and the recovery key: the data cannot be recovered by anyone, including you.
