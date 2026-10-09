// Package syncclient is the Corvid sync engine: end-to-end encryption,
// account/device protocol client, per-record LWW merge with hybrid logical
// clocks, bookmark-tree merge, offline queue. Reference implementation in Go;
// protocol in docs/security/sync.md. No cryptographic primitives are
// implemented here: only composition of x/crypto (XChaCha20-Poly1305, HKDF,
// NaCl sealed boxes), Go's Ed25519, and the OPAQUE library.
package syncclient

import (
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"

	"golang.org/x/crypto/chacha20poly1305"
	"golang.org/x/crypto/curve25519"
	"golang.org/x/crypto/hkdf"
	"golang.org/x/crypto/nacl/box"
)

// Errors surfaced to callers; never silently swallowed.
var (
	ErrIntegrity       = errors.New("syncclient: ciphertext failed authentication")
	ErrUnknownEpoch    = errors.New("syncclient: no key for record epoch (device lacks this key generation)")
	ErrBadRecoveryKey  = errors.New("syncclient: malformed recovery key")
	ErrWrongPassphrase = errors.New("syncclient: wrong passphrase or untrusted server response")
	ErrServerRollback  = errors.New("syncclient: server state went backwards (possible rollback)")
)

const padBlock = 256

// Keybag holds one 256-bit key per epoch.
type Keybag struct {
	Keys map[int][]byte `json:"keys"`
}

// NewKeybag creates a keybag with a fresh epoch 0 key.
func NewKeybag() *Keybag {
	k := &Keybag{Keys: map[int][]byte{}}
	k.Keys[0] = randBytes(32)
	return k
}

// Latest returns the newest epoch number.
func (k *Keybag) Latest() int {
	m := -1
	for e := range k.Keys {
		if e > m {
			m = e
		}
	}
	return m
}

// Rotate adds a new epoch and returns it.
func (k *Keybag) Rotate() int {
	n := k.Latest() + 1
	k.Keys[n] = randBytes(32)
	return n
}

func (k *Keybag) clone() *Keybag {
	c := &Keybag{Keys: map[int][]byte{}}
	for e, v := range k.Keys {
		c.Keys[e] = append([]byte(nil), v...)
	}
	return c
}

func (k *Keybag) marshal() []byte { b, _ := json.Marshal(k); return b }

func unmarshalKeybag(b []byte) (*Keybag, error) {
	var k Keybag
	if err := json.Unmarshal(b, &k); err != nil || len(k.Keys) == 0 {
		return nil, errors.New("syncclient: bad keybag")
	}
	for _, v := range k.Keys {
		if len(v) != 32 {
			return nil, errors.New("syncclient: bad keybag key")
		}
	}
	return &k, nil
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		panic(err)
	}
	return b
}

func hkdfKey(secret []byte, info string) []byte {
	r := hkdf.New(sha256.New, secret, nil, []byte(info))
	out := make([]byte, 32)
	if _, err := io.ReadFull(r, out); err != nil {
		panic(err)
	}
	return out
}

// CollectionKey derives the key for one collection in one epoch.
func (k *Keybag) collectionKey(epoch int, collection string) ([]byte, error) {
	ek, ok := k.Keys[epoch]
	if !ok {
		return nil, ErrUnknownEpoch
	}
	return hkdfKey(ek, "corvid-sync/v1/collection/"+collection), nil
}

// RecordID maps a logical record id to the opaque wire id.
func (k *Keybag) RecordID(collection, logical string) string {
	idk := hkdfKey(k.Keys[0], "corvid-sync/v1/id")
	m := hmac.New(sha256.New, idk)
	m.Write([]byte(collection))
	m.Write([]byte{0})
	m.Write([]byte(logical))
	return hex.EncodeToString(m.Sum(nil))
}

func aad(username, collection, rid string, epoch int) []byte {
	return []byte(fmt.Sprintf("corvid-sync/v1|%s|%s|%s|%d", username, collection, rid, epoch))
}

// pad length-prefixes and zero-pads to a multiple of padBlock.
func pad(p []byte) []byte {
	n := 4 + len(p)
	total := (n + padBlock - 1) / padBlock * padBlock
	out := make([]byte, total)
	binary.BigEndian.PutUint32(out, uint32(len(p)))
	copy(out[4:], p)
	return out
}

func unpad(p []byte) ([]byte, error) {
	if len(p) < 4 {
		return nil, ErrIntegrity
	}
	n := binary.BigEndian.Uint32(p)
	if int(n) > len(p)-4 {
		return nil, ErrIntegrity
	}
	return p[4 : 4+n], nil
}

// seal encrypts an envelope: nonce || ciphertext.
func (k *Keybag) seal(username, collection, rid string, epoch int, plaintext []byte) ([]byte, error) {
	return k.sealNonce(randBytes(chacha20poly1305.NonceSizeX), username, collection, rid, epoch, plaintext)
}

// sealNonce is seal with an explicit nonce (used only to generate deterministic test vectors).
func (k *Keybag) sealNonce(nonce []byte, username, collection, rid string, epoch int, plaintext []byte) ([]byte, error) {
	ck, err := k.collectionKey(epoch, collection)
	if err != nil {
		return nil, err
	}
	a, err := chacha20poly1305.NewX(ck)
	if err != nil {
		return nil, err
	}
	return append(append([]byte(nil), nonce...), a.Seal(nil, nonce, pad(plaintext), aad(username, collection, rid, epoch))...), nil
}

// open authenticates and decrypts. Any failure is ErrIntegrity (or ErrUnknownEpoch).
func (k *Keybag) open(username, collection, rid string, epoch int, blob []byte) ([]byte, error) {
	ck, err := k.collectionKey(epoch, collection)
	if err != nil {
		return nil, err
	}
	a, err := chacha20poly1305.NewX(ck)
	if err != nil {
		return nil, err
	}
	if len(blob) < a.NonceSize()+a.Overhead() {
		return nil, ErrIntegrity
	}
	pt, err := a.Open(nil, blob[:a.NonceSize()], blob[a.NonceSize():], aad(username, collection, rid, epoch))
	if err != nil {
		return nil, ErrIntegrity
	}
	return unpad(pt)
}

// sealTo seals the keybag to an X25519 public key (NaCl anonymous sealed box).
func sealTo(pub []byte, kb *Keybag) ([]byte, error) {
	if len(pub) != 32 {
		return nil, errors.New("syncclient: bad public key")
	}
	var p [32]byte
	copy(p[:], pub)
	return box.SealAnonymous(nil, kb.marshal(), &p, rand.Reader)
}

func openSealed(pub, priv, blob []byte) (*Keybag, error) {
	var p, s [32]byte
	copy(p[:], pub)
	copy(s[:], priv)
	pt, ok := box.OpenAnonymous(nil, blob, &p, &s)
	if !ok {
		return nil, ErrIntegrity
	}
	return unmarshalKeybag(pt)
}

// Fingerprint is a short human-comparable code of a device public key.
func Fingerprint(pub []byte) string {
	h := sha256.Sum256(pub)
	s := strings.ToUpper(hex.EncodeToString(h[:4]))
	return s[:4] + "-" + s[4:]
}

// ---------- recovery key ----------

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// RecoveryKey is the 256-bit secret shown once to the user.
type RecoveryKey [32]byte

// NewRecoveryKey generates a random recovery key.
func NewRecoveryKey() RecoveryKey {
	var r RecoveryKey
	copy(r[:], randBytes(32))
	return r
}

// String formats as groups of 4 base32 characters with a 2-byte checksum.
func (r RecoveryKey) String() string {
	sum := sha256.Sum256(r[:])
	raw := append(append([]byte(nil), r[:]...), sum[:2]...)
	s := b32.EncodeToString(raw)
	var parts []string
	for i := 0; i < len(s); i += 4 {
		parts = append(parts, s[i:min(i+4, len(s))])
	}
	return strings.Join(parts, "-")
}

// ParseRecoveryKey parses the displayed form (case/dash/space tolerant) and checks the checksum.
func ParseRecoveryKey(s string) (RecoveryKey, error) {
	var r RecoveryKey
	s = strings.ToUpper(strings.NewReplacer("-", "", " ", "", "\n", "").Replace(s))
	raw, err := b32.DecodeString(s)
	if err != nil || len(raw) != 34 {
		return r, ErrBadRecoveryKey
	}
	sum := sha256.Sum256(raw[:32])
	if raw[32] != sum[0] || raw[33] != sum[1] {
		return r, ErrBadRecoveryKey
	}
	copy(r[:], raw[:32])
	return r, nil
}

// recoveryKeys derives the Ed25519 signing key and X25519 box key pair.
type recoveryKeys struct {
	sign    ed25519.PrivateKey
	signPub ed25519.PublicKey
	boxPriv []byte
	boxPub  []byte
}

func (r RecoveryKey) derive() recoveryKeys {
	sign := ed25519.NewKeyFromSeed(hkdfKey(r[:], "corvid-sync/v1/recovery-sign"))
	bp := hkdfKey(r[:], "corvid-sync/v1/recovery-box")
	pub, _ := curve25519.X25519(bp, curve25519.Basepoint)
	return recoveryKeys{sign: sign, signPub: sign.Public().(ed25519.PublicKey), boxPriv: bp, boxPub: pub}
}

// Open authenticates and decrypts one wire blob with this keybag (exported for
// diagnostics and for acceptance tests that play a malicious server).
func (k *Keybag) Open(username, collection, wireID string, epoch int, blob []byte) ([]byte, error) {
	return k.open(username, collection, wireID, epoch, blob)
}

func sortedEpochs(k *Keybag) []int {
	var e []int
	for n := range k.Keys {
		e = append(e, n)
	}
	sort.Ints(e)
	return e
}
