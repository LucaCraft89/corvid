# sync

Self-hosted, end-to-end encrypted sync for Corvid. Protocol: `protocol/SPEC.md`. Why it looks like this: `docs/decisions/002-sync.md`.

- `server/`: `corvid-sync-server`, one static Go binary with SQLite (pure Go driver, no cgo). `server/httpapi/` holds the API and the database code.
- `client/`: reference client library. `client/vault/` is the Helium-compatible vault format (encryption, commits, rollback and fork checks); `client/gcmsiv/` is AES-256-GCM-SIV (RFC 8452); the rest is the server API, pairing, roster, revocation with key rotation, and a small key-value payload.
- `e2e/`: several simulated devices against a real server.
- `protocol/`: the spec and the test vectors.

## Build, run, test
Go 1.26 or newer (on the dev VM: `/work/tools/go/bin`).
```sh
cd sync
go test ./...                                     # unit + end-to-end tests
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o corvid-sync-server ./server
CORVID_SYNC_SERVER_BIN=$PWD/corvid-sync-server go test -count=1 ./e2e/   # same tests against the binary
CORVID_PROTOC=/work/src/out/Default/protoc \
CORVID_VAULT_PROTO=/work/src/components/sync/engine/sync_vault/sync_vault.proto \
  go test -run Protoc -v ./client/vault/          # encoding equals Helium's .proto

./corvid-sync-server serve --db sync.db --listen 127.0.0.1:8443   # plain HTTP: put TLS in front
./corvid-sync-server token --db sync.db --account alice           # one-time registration token
./corvid-sync-server devices --db sync.db --account alice
./corvid-sync-server revoke --db sync.db --device dev_...
docker build -t corvid-sync-server .                              # see Dockerfile for run lines
```
Back up `sync.db` (plus `-wal`/`-shm` while it runs, or stop it first). The server holds only ciphertext; losing every device and the recovery key means the data is gone.

## The browser side
`components/corvid_sync/` in Chromium (`patches/common/sync-client.patch`). Helium's vault engine and Chromium's sync engine run unchanged; this adds what they lack:
- `http` / `api_client` / `server_transport`: Helium's `SyncVaultTransport` over this server's API. Blocking, on the sync thread.
- `keys` / `roster` / `account`: section 4 of the spec (pairing, recovery key, revocation with rotation). Checked against `protocol/vectors-*.json`.
- `backend`: what `ChromeSyncClient` calls: is sync set up, and build the engine. Keys and secrets live in one profile pref, encrypted with OSCrypt.
- `service`: per profile. Runs account work off the UI thread, restarts the engine when the vault changes, polls every 2 minutes. Does nothing until sync is set up, so a browser without sync sends nothing.

Page: `corvid://sync` (`webui/src/pages/sync/`), linked from `corvid://preferences`. Selected at setup: bookmarks, settings, themes, passwords, extensions, history. Not open tabs.

```sh
out/Default/corvid_sync_unittests             # client unit tests (build target corvid_sync_unittests)
cd webui && npm run sync-check                # real profiles through the real server (~10 min)
```
To try it by hand: start the server, run `corvid-sync-server token --db sync.db --account NAME`, open `corvid://sync` and choose "Start sync for the first time". Plain `http://` only works for a server on the same computer; anywhere else needs `https://`, because the device secret travels in a header.
