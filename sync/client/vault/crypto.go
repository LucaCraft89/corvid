// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package vault

import (
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"errors"

	"github.com/lucacraft89/corvid/sync/client/gcmsiv"
)

// Protocol constants shared with Helium's vault format. They are wire labels,
// not branding: changing them breaks compatibility.
const (
	KeySize              = 32
	keyInfo              = "helium-private-sync-v1/object-aead/aes-256-gcm-siv"
	associatedDataPrefix = "helium-private-sync-v1/object/"
	ContainerOverhead    = gcmsiv.NonceSize + gcmsiv.TagSize // 28
	MaxEncryptedObject   = 16 * 1024 * 1024
	MaxMetadataPlaintext = 64*1024 - ContainerOverhead
	MaxCommitPlaintext   = 4*1024*1024 - ContainerOverhead
	MaxPayloadPlaintext  = MaxEncryptedObject - ContainerOverhead
	MaxObjectIDBytes     = 64
	MaxRevisionBytes     = 4096
	maxMetadataContainer = MaxMetadataPlaintext + ContainerOverhead
	maxCommitContainer   = MaxCommitPlaintext + ContainerOverhead
	minEpochHistoryBytes = 256 * 1024 * 1024
	EpochCommitTarget    = 64
	MaxCommitAncestry    = 2 * EpochCommitTarget
	DigestSize           = 32
	FormatVersion        = 1
	HeadObjectID         = "head"
)

// Role is authenticated as associated data so an object cannot be replayed
// as another kind. 1-3 are Helium's; 16 and up are Corvid additions that
// Helium clients never read.
type Role uint8

const (
	RoleHead    Role = 1
	RoleCommit  Role = 2
	RolePayload Role = 3
	RoleRoster  Role = 16
)

var (
	ErrInvalidKey     = errors.New("vault: key must be 32 bytes")
	ErrInvalidUUID    = errors.New("vault: UUID must be a lowercase RFC 4122 UUID")
	ErrAuthentication = errors.New("vault: authentication failed (wrong key or tampered data)")
	ErrMalformed      = errors.New("vault: malformed object")
	ErrTooLarge       = errors.New("vault: object too large")
)

func maxPlaintext(r Role) int {
	switch r {
	case RoleHead, RoleRoster:
		return MaxMetadataPlaintext
	case RoleCommit:
		return MaxCommitPlaintext
	case RolePayload:
		return MaxPayloadPlaintext
	}
	return -1
}

// Cryptographer mirrors Helium's SyncVaultCryptographer.
type Cryptographer struct {
	aead *gcmsiv.AEAD
	uuid string
	rand func([]byte) // nonce source, replaceable for test vectors
}

func NewCryptographer(vaultKey []byte, vaultUUID string) (*Cryptographer, error) {
	if len(vaultKey) != KeySize {
		return nil, ErrInvalidKey
	}
	if !ValidUUID(vaultUUID) {
		return nil, ErrInvalidUUID
	}
	objectKey, err := hkdf.Key(sha256.New, vaultKey, []byte(vaultUUID), keyInfo, KeySize)
	if err != nil {
		return nil, err
	}
	a, err := gcmsiv.New(objectKey)
	clear(objectKey)
	if err != nil {
		return nil, err
	}
	return &Cryptographer{aead: a, uuid: vaultUUID, rand: func(b []byte) { rand.Read(b) }}, nil
}

func (c *Cryptographer) UUID() string { return c.uuid }

func (c *Cryptographer) associatedData(r Role) []byte {
	ad := make([]byte, 0, len(associatedDataPrefix)+len(c.uuid)+1)
	ad = append(ad, associatedDataPrefix...)
	ad = append(ad, c.uuid...)
	return append(ad, byte(r))
}

// Encrypt returns nonce || ciphertext || tag.
func (c *Cryptographer) Encrypt(r Role, plaintext []byte) ([]byte, error) {
	m := maxPlaintext(r)
	if m < 0 {
		return nil, ErrMalformed
	}
	if len(plaintext) > m {
		return nil, ErrTooLarge
	}
	nonce := make([]byte, gcmsiv.NonceSize)
	c.rand(nonce)
	return c.aead.Seal(nonce, nonce, plaintext, c.associatedData(r)), nil
}

func (c *Cryptographer) Decrypt(r Role, container []byte) ([]byte, error) {
	m := maxPlaintext(r)
	if m < 0 || len(container) < ContainerOverhead {
		return nil, ErrMalformed
	}
	if len(container) > ContainerOverhead+m {
		return nil, ErrTooLarge
	}
	pt, err := c.aead.Open(nil, container[:gcmsiv.NonceSize], container[gcmsiv.NonceSize:], c.associatedData(r))
	if err != nil {
		return nil, ErrAuthentication
	}
	return pt, nil
}

// ValidUUID accepts the lowercase 8-4-4-4-12 form that base::Uuid::ParseLowercase
// accepts (any version/variant bits).
func ValidUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i := 0; i < len(s); i++ {
		ch := s[i]
		switch i {
		case 8, 13, 18, 23:
			if ch != '-' {
				return false
			}
		default:
			if !(ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f') {
				return false
			}
		}
	}
	return true
}

// NewUUID returns a random version 4 UUID.
func NewUUID() string {
	var b [16]byte
	rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	const hexd = "0123456789abcdef"
	out := make([]byte, 0, 36)
	for i, x := range b {
		if i == 4 || i == 6 || i == 8 || i == 10 {
			out = append(out, '-')
		}
		out = append(out, hexd[x>>4], hexd[x&15])
	}
	return string(out)
}

// NewKey returns a fresh random vault key.
func NewKey() []byte {
	k := make([]byte, KeySize)
	rand.Read(k)
	return k
}
