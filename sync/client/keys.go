// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package client

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/lucacraft89/corvid/sync/client/vault"
)

// Labels for Corvid's additions (pairing, rotation). Domain separation only.
const (
	labelSAS      = "corvid-sync-v1/comparison-code"
	labelEnvelope = "corvid-sync-v1/envelope"
	labelRotate   = "corvid-sync-v1/rotate"
	recoveryTag   = "CVK1"

	KindVaultKey    = "vault-key"    // pairing: approver -> new device
	KindVaultRotate = "vault-rotate" // rotation: rotating device -> remaining devices
)

var (
	ErrEnvelope    = errors.New("key envelope failed to authenticate (wrong pairing secret, wrong sender or tampered)")
	ErrRecoveryKey = errors.New("recovery key is mistyped (checksum mismatch)")
)

// Identity is a device's long-term X25519 key. The public half is registered
// with the server and listed in the vault roster.
type Identity struct {
	Private *ecdh.PrivateKey
}

func NewIdentity() (*Identity, error) {
	k, err := ecdh.X25519().GenerateKey(rand.Reader)
	return &Identity{k}, err
}

func IdentityFromBytes(b []byte) (*Identity, error) {
	k, err := ecdh.X25519().NewPrivateKey(b)
	return &Identity{k}, err
}

func (id *Identity) Public() []byte { return id.Private.PublicKey().Bytes() }

// ComparisonCode is the 6-digit code both devices show during pairing. It
// binds both public keys to the pairing secret, which the server never sees,
// so a server that swaps keys produces different codes.
func ComparisonCode(pairSecret, approverPub, newPub []byte) string {
	m := hmac.New(sha256.New, pairSecret)
	m.Write([]byte(labelSAS))
	m.Write(approverPub)
	m.Write(newPub)
	sum := m.Sum(nil)
	return fmt.Sprintf("%06d", binary.BigEndian.Uint64(sum[:8])%1_000_000)
}

// rotationSalt proves knowledge of the old vault key.
func rotationSalt(oldKey []byte, oldUUID string) []byte {
	m := hmac.New(sha256.New, oldKey)
	m.Write([]byte(labelRotate))
	m.Write([]byte(oldUUID))
	return m.Sum(nil)
}

// envelopeKey derives the AES-256-GCM key for a message from sender to
// recipient. salt is the pairing secret (KindVaultKey) or the rotation salt
// (KindVaultRotate), so the server alone can never derive it.
func envelopeKey(self *Identity, peerPub []byte, salt []byte, kind string, senderPub, recipientPub []byte) ([]byte, error) {
	peer, err := ecdh.X25519().NewPublicKey(peerPub)
	if err != nil {
		return nil, err
	}
	shared, err := self.Private.ECDH(peer)
	if err != nil {
		return nil, err
	}
	info := make([]byte, 0, 128)
	info = append(info, labelEnvelope+"/"+kind+"/"...)
	info = append(info, senderPub...)
	info = append(info, recipientPub...)
	return hkdf.Key(sha256.New, shared, salt, string(info), 32)
}

// VaultGrant is what an envelope carries.
type VaultGrant struct {
	VaultUUID   string `json:"vault_uuid"`
	VaultKey    []byte `json:"vault_key"`
	DisplayName string `json:"display_name"`
	// Set on rotation: the vault being replaced.
	ReplacesUUID string `json:"replaces_uuid,omitempty"`
}

func sealEnvelope(sender *Identity, recipientPub, salt []byte, kind string, g VaultGrant, nonce []byte) ([]byte, error) {
	k, err := envelopeKey(sender, recipientPub, salt, kind, sender.Public(), recipientPub)
	if err != nil {
		return nil, err
	}
	block, _ := aes.NewCipher(k)
	gcm, _ := cipher.NewGCM(block)
	pt, _ := json.Marshal(g)
	if nonce == nil {
		nonce = make([]byte, gcm.NonceSize())
		rand.Read(nonce)
	}
	return gcm.Seal(append([]byte(nil), nonce...), nonce, pt, []byte(labelEnvelope+"/"+kind)), nil
}

func openEnvelope(recipient *Identity, senderPub, salt []byte, kind string, env []byte) (*VaultGrant, error) {
	k, err := envelopeKey(recipient, senderPub, salt, kind, senderPub, recipient.Public())
	if err != nil {
		return nil, ErrEnvelope
	}
	block, _ := aes.NewCipher(k)
	gcm, _ := cipher.NewGCM(block)
	if len(env) < gcm.NonceSize()+gcm.Overhead() {
		return nil, ErrEnvelope
	}
	pt, err := gcm.Open(nil, env[:gcm.NonceSize()], env[gcm.NonceSize():], []byte(labelEnvelope+"/"+kind))
	if err != nil {
		return nil, ErrEnvelope
	}
	var g VaultGrant
	if err := json.Unmarshal(pt, &g); err != nil || len(g.VaultKey) != vault.KeySize || !vault.ValidUUID(g.VaultUUID) {
		return nil, ErrEnvelope
	}
	return &g, nil
}

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// EncodeRecoveryKey renders a vault key for the user to write down:
// "CVK1-" then base32 of key || first 2 bytes of SHA-256(key), in groups of 5.
func EncodeRecoveryKey(key []byte) string {
	sum := sha256.Sum256(key)
	s := b32.EncodeToString(append(append([]byte(nil), key...), sum[:2]...))
	var groups []string
	for len(s) > 5 {
		groups = append(groups, s[:5])
		s = s[5:]
	}
	groups = append(groups, s)
	return recoveryTag + "-" + strings.Join(groups, "-")
}

func DecodeRecoveryKey(s string) ([]byte, error) {
	s = strings.ToUpper(strings.Join(strings.Fields(s), ""))
	s = strings.TrimPrefix(s, recoveryTag+"-")
	s = strings.ReplaceAll(s, "-", "")
	// Common misreadings.
	s = strings.NewReplacer("0", "O", "1", "I", "8", "B").Replace(s)
	raw, err := b32.DecodeString(s)
	if err != nil || len(raw) != vault.KeySize+2 {
		return nil, ErrRecoveryKey
	}
	sum := sha256.Sum256(raw[:vault.KeySize])
	if sum[0] != raw[vault.KeySize] || sum[1] != raw[vault.KeySize+1] {
		return nil, ErrRecoveryKey
	}
	return raw[:vault.KeySize], nil
}
