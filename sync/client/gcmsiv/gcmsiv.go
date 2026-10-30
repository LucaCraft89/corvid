// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Package gcmsiv implements AEAD_AES_256_GCM_SIV from RFC 8452. Go's standard
// library has no GCM-SIV; Helium's vault format uses it (through BoringSSL),
// so the reference client needs it to read and write compatible vaults.
package gcmsiv

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/subtle"
	"encoding/binary"
	"errors"
)

const (
	KeySize   = 32
	NonceSize = 12
	TagSize   = 16
)

var ErrOpen = errors.New("gcmsiv: message authentication failed")

type AEAD struct {
	block cipher.Block // key-generating key
}

func New(key []byte) (*AEAD, error) {
	if len(key) != KeySize {
		return nil, errors.New("gcmsiv: key must be 32 bytes")
	}
	b, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return &AEAD{block: b}, nil
}

func (a *AEAD) NonceSize() int { return NonceSize }
func (a *AEAD) Overhead() int  { return TagSize }

// deriveKeys implements section 4: the per-nonce authentication key (16
// bytes) and encryption key (32 bytes) are the first halves of AES blocks
// LE32(i) || nonce for i = 0..5.
func (a *AEAD) deriveKeys(nonce []byte) (authKey [16]byte, encKey [32]byte) {
	var in, out [16]byte
	copy(in[4:], nonce)
	for i := uint32(0); i < 6; i++ {
		binary.LittleEndian.PutUint32(in[:4], i)
		a.block.Encrypt(out[:], in[:])
		if i < 2 {
			copy(authKey[i*8:], out[:8])
		} else {
			copy(encKey[(i-2)*8:], out[:8])
		}
	}
	return
}

func (a *AEAD) tag(authKey [16]byte, enc cipher.Block, nonce, plaintext, aad []byte) [16]byte {
	p := newPolyval(authKey[:])
	p.update(aad)
	p.update(plaintext)
	var lengths [16]byte
	binary.LittleEndian.PutUint64(lengths[:8], uint64(len(aad))*8)
	binary.LittleEndian.PutUint64(lengths[8:], uint64(len(plaintext))*8)
	p.update(lengths[:])
	s := p.sum()
	for i := 0; i < NonceSize; i++ {
		s[i] ^= nonce[i]
	}
	s[15] &= 0x7f
	var t [16]byte
	enc.Encrypt(t[:], s[:])
	return t
}

// ctr is AES-CTR with a 32-bit little-endian counter in the first word that
// wraps modulo 2^32 (section 4).
func ctr(enc cipher.Block, tag [16]byte, dst, src []byte) {
	block := tag
	block[15] |= 0x80
	var ks [16]byte
	for len(src) > 0 {
		enc.Encrypt(ks[:], block[:])
		n := min(16, len(src))
		subtle.XORBytes(dst[:n], src[:n], ks[:n])
		dst, src = dst[n:], src[n:]
		binary.LittleEndian.PutUint32(block[:4], binary.LittleEndian.Uint32(block[:4])+1)
	}
}

// Seal appends ciphertext || tag to dst.
func (a *AEAD) Seal(dst, nonce, plaintext, aad []byte) []byte {
	if len(nonce) != NonceSize {
		panic("gcmsiv: bad nonce length")
	}
	authKey, encKey := a.deriveKeys(nonce)
	enc, _ := aes.NewCipher(encKey[:])
	t := a.tag(authKey, enc, nonce, plaintext, aad)
	out := make([]byte, len(plaintext)+TagSize)
	ctr(enc, t, out, plaintext)
	copy(out[len(plaintext):], t[:])
	return append(dst, out...)
}

// Open checks and decrypts ciphertext || tag and appends the plaintext to dst.
func (a *AEAD) Open(dst, nonce, ciphertext, aad []byte) ([]byte, error) {
	if len(nonce) != NonceSize || len(ciphertext) < TagSize {
		return nil, ErrOpen
	}
	authKey, encKey := a.deriveKeys(nonce)
	enc, _ := aes.NewCipher(encKey[:])
	var t [16]byte
	copy(t[:], ciphertext[len(ciphertext)-TagSize:])
	body := ciphertext[:len(ciphertext)-TagSize]
	plain := make([]byte, len(body))
	ctr(enc, t, plain, body)
	want := a.tag(authKey, enc, nonce, plain, aad)
	if subtle.ConstantTimeCompare(want[:], t[:]) != 1 {
		clear(plain)
		return nil, ErrOpen
	}
	return append(dst, plain...), nil
}

// polyval works on field elements stored as little-endian 128-bit integers
// (lo, hi), bit i being the coefficient of x^i, modulo
// x^128 + x^127 + x^126 + x^121 + 1.
type polyval struct {
	hLo, hHi uint64
	sLo, sHi uint64
}

func newPolyval(h []byte) *polyval {
	return &polyval{hLo: binary.LittleEndian.Uint64(h[:8]), hHi: binary.LittleEndian.Uint64(h[8:])}
}

// update absorbs data zero-padded to a multiple of 16 bytes.
func (p *polyval) update(data []byte) {
	for len(data) > 0 {
		var blk [16]byte
		n := copy(blk[:], data)
		data = data[n:]
		p.sLo ^= binary.LittleEndian.Uint64(blk[:8])
		p.sHi ^= binary.LittleEndian.Uint64(blk[8:])
		p.sLo, p.sHi = dot(p.sLo, p.sHi, p.hLo, p.hHi)
	}
}

func (p *polyval) sum() [16]byte {
	var out [16]byte
	binary.LittleEndian.PutUint64(out[:8], p.sLo)
	binary.LittleEndian.PutUint64(out[8:], p.sHi)
	return out
}

// dot returns a * b * x^-128: Horner over the bits of b, multiplying the
// accumulator by x^-1 after each step. Branch-free on secret data.
func dot(aLo, aHi, bLo, bHi uint64) (uint64, uint64) {
	var rLo, rHi uint64
	for i := 0; i < 128; i++ {
		var bit uint64
		if i < 64 {
			bit = (bLo >> uint(i)) & 1
		} else {
			bit = (bHi >> uint(i-64)) & 1
		}
		m := -bit
		rLo ^= aLo & m
		rHi ^= aHi & m
		// r * x^-1: if bit 0 is set, add the modulus first, then shift right.
		odd := -(rLo & 1)
		rLo = rLo>>1 | rHi<<63
		rHi = rHi>>1 ^ (0xE100000000000000 & odd)
	}
	return rLo, rHi
}
