module corvid/synctests

go 1.26.0

require (
	corvid/syncclient v0.0.0
	corvid/syncserver v0.0.0
	modernc.org/sqlite v1.60.1
)

require (
	filippo.io/edwards25519 v1.2.0 // indirect
	filippo.io/nistec v0.0.4 // indirect
	github.com/bytemare/ecc v0.9.0 // indirect
	github.com/bytemare/hash v0.6.2 // indirect
	github.com/bytemare/hash2curve v0.5.4 // indirect
	github.com/bytemare/ksf v0.5.0 // indirect
	github.com/bytemare/opaque v0.18.0 // indirect
	github.com/bytemare/secp256k1 v0.3.0 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/gtank/ristretto255 v0.2.0 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/crypto v0.58.0 // indirect
	golang.org/x/sys v0.49.0 // indirect
	modernc.org/libc v1.77.1 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.12.1 // indirect
)

replace corvid/syncclient => ../../../src-overlay/corvid/sync

replace corvid/syncserver => ../../../server/sync
