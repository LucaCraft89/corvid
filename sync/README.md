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
