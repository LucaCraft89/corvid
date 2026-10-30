// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package vault

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"math"
)

// The records below are byte-compatible with Helium's sync_vault.proto
// (proto2). Encoding follows protobuf: fields in number order, set fields
// always written.

type Digest [DigestSize]byte

func ContentDigest(encrypted []byte) Digest { return sha256.Sum256(encrypted) }

// ObjectID is the lowercase hex form used as the immutable object name.
func (d Digest) ObjectID() string { return hex.EncodeToString(d[:]) }

var ErrUnsupportedVersion = errors.New("vault: unsupported format version")

type Head struct {
	CommitDigest *Digest // nil: initialized vault with no commits
}

type CommitHeader struct {
	Generation                uint64
	Epoch                     uint32
	EpochStartGeneration      uint64
	MinimumRetainedGeneration uint64
	EpochPayloadBytes         uint64
}

type Commit struct {
	Header              CommitHeader
	ParentDigest        *Digest
	InlinePayload       []byte
	ExternalPayloadSize uint32
	ChunkDigests        []Digest
}

// Checkpoint is kept on the device (never on the server) to detect rollback
// and forks.
type Checkpoint struct {
	VaultUUID    string
	Generation   uint64
	CommitDigest *Digest
}

// --- protobuf wire helpers ---

func putVarint(b []byte, field int, v uint64) []byte {
	b = binary.AppendUvarint(b, uint64(field)<<3|0)
	return binary.AppendUvarint(b, v)
}

func putBytes(b []byte, field int, v []byte) []byte {
	b = binary.AppendUvarint(b, uint64(field)<<3|2)
	b = binary.AppendUvarint(b, uint64(len(v)))
	return append(b, v...)
}

type pbField struct {
	num    int
	varint uint64
	bytes  []byte
	isLen  bool
}

// parsePB splits a message into fields. Unknown fields are kept in the list
// and ignored by callers, as protobuf does.
func parsePB(b []byte) ([]pbField, error) {
	var out []pbField
	for len(b) > 0 {
		key, n := binary.Uvarint(b)
		if n <= 0 || key>>3 == 0 || key>>3 > math.MaxInt32 {
			return nil, ErrMalformed
		}
		b = b[n:]
		f := pbField{num: int(key >> 3)}
		switch key & 7 {
		case 0:
			v, n := binary.Uvarint(b)
			if n <= 0 {
				return nil, ErrMalformed
			}
			f.varint, b = v, b[n:]
		case 1:
			if len(b) < 8 {
				return nil, ErrMalformed
			}
			b = b[8:]
			continue
		case 5:
			if len(b) < 4 {
				return nil, ErrMalformed
			}
			b = b[4:]
			continue
		case 2:
			l, n := binary.Uvarint(b)
			if n <= 0 || l > uint64(len(b)-n) {
				return nil, ErrMalformed
			}
			f.bytes, f.isLen, b = b[n:n+int(l)], true, b[n+int(l):]
		default:
			return nil, ErrMalformed
		}
		out = append(out, f)
	}
	return out, nil
}

func digestFrom(b []byte) (*Digest, error) {
	if len(b) != DigestSize {
		return nil, ErrMalformed
	}
	var d Digest
	copy(d[:], b)
	return &d, nil
}

func checkVersion(has bool, v uint64) error {
	if !has {
		return ErrMalformed
	}
	if v != FormatVersion {
		return ErrUnsupportedVersion
	}
	return nil
}

// --- Head ---

func MarshalHead(h Head) []byte {
	b := putVarint(nil, 1, FormatVersion)
	if h.CommitDigest != nil {
		b = putBytes(b, 2, h.CommitDigest[:])
	}
	return b
}

func UnmarshalHead(b []byte) (Head, error) {
	if len(b) > MaxMetadataPlaintext {
		return Head{}, ErrTooLarge
	}
	fs, err := parsePB(b)
	if err != nil {
		return Head{}, err
	}
	var h Head
	var hasV bool
	var ver uint64
	for _, f := range fs {
		switch {
		case f.num == 1 && !f.isLen:
			hasV, ver = true, f.varint
		case f.num == 2 && f.isLen:
			if h.CommitDigest, err = digestFrom(f.bytes); err != nil {
				return Head{}, err
			}
		case f.num <= 2:
			return Head{}, ErrMalformed
		}
	}
	return h, checkVersion(hasV, ver)
}

// --- Commit ---

func payloadSize(c *Commit) uint64 {
	if len(c.InlinePayload) > 0 {
		return uint64(len(c.InlinePayload))
	}
	return uint64(c.ExternalPayloadSize)
}

func validCommit(c *Commit) bool {
	h := c.Header
	if h.EpochStartGeneration == 0 || h.EpochStartGeneration > h.Generation || uint64(h.Epoch) >= h.EpochStartGeneration {
		return false
	}
	if h.Generation == 1 {
		if c.ParentDigest != nil || h.Epoch != 0 || h.EpochStartGeneration != 1 {
			return false
		}
	} else if c.ParentDigest == nil {
		return false
	}
	if h.Epoch <= 1 {
		if h.MinimumRetainedGeneration != 0 {
			return false
		}
	} else if h.MinimumRetainedGeneration == 0 || h.MinimumRetainedGeneration >= h.EpochStartGeneration {
		return false
	}
	if len(c.InlinePayload) > 0 {
		if len(c.ChunkDigests) != 0 || c.ExternalPayloadSize != 0 || len(c.InlinePayload) > MaxCommitPlaintext {
			return false
		}
	} else {
		if c.ExternalPayloadSize == 0 || len(c.ChunkDigests) != 1+int((c.ExternalPayloadSize-1)/MaxPayloadPlaintext) {
			return false
		}
		seen := map[Digest]bool{}
		for _, d := range c.ChunkDigests {
			if seen[d] {
				return false
			}
			seen[d] = true
		}
	}
	if h.Generation == h.EpochStartGeneration {
		return h.EpochPayloadBytes == payloadSize(c)
	}
	return h.EpochPayloadBytes >= payloadSize(c)
}

func MarshalCommit(c *Commit) ([]byte, error) {
	if !validCommit(c) {
		return nil, ErrMalformed
	}
	b := putVarint(nil, 1, FormatVersion)
	b = putVarint(b, 2, c.Header.Generation)
	if c.ParentDigest != nil {
		b = putBytes(b, 3, c.ParentDigest[:])
	}
	b = putVarint(b, 4, uint64(c.Header.Epoch))
	b = putVarint(b, 5, c.Header.EpochStartGeneration)
	b = putVarint(b, 6, c.Header.MinimumRetainedGeneration)
	b = putVarint(b, 7, c.Header.EpochPayloadBytes)
	if len(c.InlinePayload) > 0 {
		b = putBytes(b, 8, c.InlinePayload)
	}
	for _, d := range c.ChunkDigests {
		b = putBytes(b, 9, d[:])
	}
	if len(c.ChunkDigests) > 0 {
		b = putVarint(b, 10, uint64(c.ExternalPayloadSize))
	}
	if len(b) > MaxCommitPlaintext {
		return nil, ErrTooLarge
	}
	return b, nil
}

func UnmarshalCommit(b []byte) (*Commit, error) {
	if len(b) > MaxCommitPlaintext {
		return nil, ErrTooLarge
	}
	fs, err := parsePB(b)
	if err != nil {
		return nil, err
	}
	c := &Commit{}
	has := map[int]bool{}
	var ver uint64
	for _, f := range fs {
		want := f.num == 3 || f.num == 8 || f.num == 9
		if f.num <= 10 && f.isLen != want {
			return nil, ErrMalformed
		}
		has[f.num] = true
		switch f.num {
		case 1:
			ver = f.varint
		case 2:
			c.Header.Generation = f.varint
		case 3:
			if c.ParentDigest, err = digestFrom(f.bytes); err != nil {
				return nil, err
			}
		case 4:
			if f.varint > math.MaxUint32 {
				return nil, ErrMalformed
			}
			c.Header.Epoch = uint32(f.varint)
		case 5:
			c.Header.EpochStartGeneration = f.varint
		case 6:
			c.Header.MinimumRetainedGeneration = f.varint
		case 7:
			c.Header.EpochPayloadBytes = f.varint
		case 8:
			c.InlinePayload = append([]byte(nil), f.bytes...)
		case 9:
			d, err := digestFrom(f.bytes)
			if err != nil {
				return nil, err
			}
			c.ChunkDigests = append(c.ChunkDigests, *d)
		case 10:
			if f.varint > math.MaxUint32 {
				return nil, ErrMalformed
			}
			c.ExternalPayloadSize = uint32(f.varint)
		}
	}
	for _, n := range []int{1, 2, 4, 5, 6, 7} {
		if !has[n] {
			return nil, ErrMalformed
		}
	}
	if err := checkVersion(true, ver); err != nil {
		return nil, err
	}
	external := len(c.ChunkDigests) > 0
	if has[8] == external || has[10] != external {
		return nil, ErrMalformed
	}
	if !validCommit(c) {
		return nil, ErrMalformed
	}
	return c, nil
}

// MinimumRetainedGenerationForEpoch keeps the preceding epoch as well.
func MinimumRetainedGenerationForEpoch(epoch uint32, previousEpochStart uint64) uint64 {
	if epoch <= 1 {
		return 0
	}
	return previousEpochStart
}

// ValidTransition reports whether child can directly follow parent.
func ValidTransition(parentDigest Digest, parent CommitHeader, child *Commit) bool {
	if parent.Generation == math.MaxUint64 || child.Header.Generation != parent.Generation+1 ||
		child.ParentDigest == nil || *child.ParentDigest != parentDigest {
		return false
	}
	if child.Header.Epoch == parent.Epoch {
		sum := parent.EpochPayloadBytes + payloadSize(child)
		if sum < parent.EpochPayloadBytes {
			return false
		}
		return child.Header.EpochStartGeneration == parent.EpochStartGeneration &&
			child.Header.MinimumRetainedGeneration == parent.MinimumRetainedGeneration &&
			child.Header.EpochPayloadBytes == sum
	}
	return parent.Epoch != math.MaxUint32 && child.Header.Epoch == parent.Epoch+1 &&
		child.Header.EpochStartGeneration == child.Header.Generation &&
		child.Header.MinimumRetainedGeneration == MinimumRetainedGenerationForEpoch(child.Header.Epoch, parent.EpochStartGeneration)
}

// --- Checkpoint ---

func validCheckpoint(c Checkpoint) bool {
	return ValidUUID(c.VaultUUID) && ((c.Generation == 0 && c.CommitDigest == nil) || (c.Generation > 0 && c.CommitDigest != nil))
}

func MarshalCheckpoint(c Checkpoint) ([]byte, error) {
	if !validCheckpoint(c) {
		return nil, ErrMalformed
	}
	b := putVarint(nil, 1, FormatVersion)
	b = putBytes(b, 2, []byte(c.VaultUUID))
	b = putVarint(b, 3, c.Generation)
	if c.CommitDigest != nil {
		b = putBytes(b, 4, c.CommitDigest[:])
	}
	return b, nil
}

func UnmarshalCheckpoint(b []byte) (Checkpoint, error) {
	fs, err := parsePB(b)
	if err != nil {
		return Checkpoint{}, err
	}
	var c Checkpoint
	has := map[int]bool{}
	var ver uint64
	for _, f := range fs {
		has[f.num] = true
		switch f.num {
		case 1:
			ver = f.varint
		case 2:
			c.VaultUUID = string(f.bytes)
		case 3:
			c.Generation = f.varint
		case 4:
			if c.CommitDigest, err = digestFrom(f.bytes); err != nil {
				return Checkpoint{}, err
			}
		}
	}
	if !has[1] || !has[2] || !has[3] {
		return Checkpoint{}, ErrMalformed
	}
	if err := checkVersion(true, ver); err != nil {
		return Checkpoint{}, err
	}
	if !validCheckpoint(c) {
		return Checkpoint{}, ErrMalformed
	}
	return c, nil
}

// --- history ---

type HistoryResult int

const (
	AcceptCurrent HistoryResult = iota
	AcceptDescendant
	AcceptBaseline
	Rollback
	Fork
	IncompleteHistory
	InvalidHistory
)

// AncestryEntry is one authenticated commit, newest first, starting with the
// candidate itself.
type AncestryEntry struct {
	Digest       Digest
	Generation   uint64
	ParentDigest *Digest
}

func eqDigest(a, b *Digest) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// ValidateHistory is a port of Helium's ValidateSyncVaultHistory.
func ValidateHistory(cp Checkpoint, candidate *Commit, candidateDigest Digest, ancestry []AncestryEntry) HistoryResult {
	if !validCheckpoint(cp) || !validCommit(candidate) || len(ancestry) > MaxCommitAncestry {
		return InvalidHistory
	}
	g := candidate.Header.Generation
	if g < cp.Generation {
		return Rollback
	}
	if g == cp.Generation {
		if len(ancestry) != 0 {
			return InvalidHistory
		}
		if eqDigest(cp.CommitDigest, &candidateDigest) {
			return AcceptCurrent
		}
		return Fork
	}
	if cp.Generation == 0 || cp.Generation < candidate.Header.MinimumRetainedGeneration {
		if len(ancestry) == 0 {
			return AcceptBaseline
		}
		return InvalidHistory
	}
	expGen, expDigest := g, candidateDigest
	for i, a := range ancestry {
		if a.Generation != expGen || a.Digest != expDigest {
			return InvalidHistory
		}
		if expGen == cp.Generation+1 {
			if i+1 != len(ancestry) {
				return InvalidHistory
			}
			if eqDigest(a.ParentDigest, cp.CommitDigest) {
				return AcceptDescendant
			}
			return Fork
		}
		if a.ParentDigest == nil {
			return InvalidHistory
		}
		expGen--
		expDigest = *a.ParentDigest
	}
	return IncompleteHistory
}
