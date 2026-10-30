// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package vault

import (
	"errors"
	"fmt"
	"math"
)

// Transport is the server side of a vault: opaque objects with exact
// revisions and atomic conditional writes. It matches Helium's
// SyncVaultTransport.
type Transport interface {
	// Read returns nil, nil when the object does not exist.
	Read(objectID string, maxBytes int) (*Object, error)
	// Write with expectedRevision nil means "create only if absent".
	// A failed condition returns ErrConflict.
	Write(objectID string, expectedRevision *string, data []byte, retentionEpoch *uint32) (string, error)
	CollectEpochsBefore(minimumRetainedEpoch uint32) error
}

type Object struct {
	Data     []byte
	Revision string
}

// Codec knows the payload. The vault layer stores snapshots and deltas
// without reading them.
type Codec interface {
	ValidateSnapshot(snapshot []byte) error
	ApplyDelta(state, delta []byte) ([]byte, error)
}

var (
	ErrConflict          = errors.New("vault: head changed on the server (retry)")
	ErrNotInitialized    = errors.New("vault: no head object")
	ErrRollback          = errors.New("vault: server returned an older state than this device already saw (rollback)")
	ErrFork              = errors.New("vault: server history does not descend from this device's checkpoint (fork)")
	ErrIncompleteHistory = errors.New("vault: history objects are missing")
	ErrContentAddress    = errors.New("vault: object does not match its content address (tampered)")
	ErrInvalidData       = errors.New("vault: invalid data")
)

type State struct {
	Data         []byte
	Head         Head
	Header       *CommitHeader // nil before the first commit
	HeadRevision string
}

func (s *State) Generation() uint64 {
	if s.Header == nil {
		return 0
	}
	return s.Header.Generation
}

type Store struct {
	t           Transport
	c           *Cryptographer
	codec       Codec
	checkpoint  Checkpoint
	persist     func(Checkpoint) error
	collectedTo uint32
}

// NewStore opens a vault. cp is the device's last checkpoint for this vault
// (zero value for a vault never seen). persist is called whenever the
// checkpoint advances; it must store it durably.
func NewStore(t Transport, key []byte, uuid string, codec Codec, cp Checkpoint, persist func(Checkpoint) error) (*Store, error) {
	c, err := NewCryptographer(key, uuid)
	if err != nil {
		return nil, err
	}
	if cp.VaultUUID == "" {
		cp = Checkpoint{VaultUUID: uuid}
	}
	if cp.VaultUUID != uuid || !validCheckpoint(cp) {
		return nil, ErrInvalidData
	}
	if persist == nil {
		persist = func(Checkpoint) error { return nil }
	}
	return &Store{t: t, c: c, codec: codec, checkpoint: cp, persist: persist}, nil
}

func (s *Store) Cryptographer() *Cryptographer { return s.c }
func (s *Store) Checkpoint() Checkpoint        { return s.checkpoint }

func (s *Store) readHead() (Head, string, error) {
	obj, err := s.t.Read(HeadObjectID, maxMetadataContainer)
	if err != nil {
		return Head{}, "", err
	}
	if obj == nil {
		return Head{}, "", ErrNotInitialized
	}
	if len(obj.Data) > maxMetadataContainer || obj.Revision == "" || len(obj.Revision) > MaxRevisionBytes {
		return Head{}, "", ErrInvalidData
	}
	pt, err := s.c.Decrypt(RoleHead, obj.Data)
	if err != nil {
		return Head{}, "", err
	}
	h, err := UnmarshalHead(pt)
	return h, obj.Revision, err
}

func (s *Store) readImmutable(d Digest, role Role, max int) ([]byte, error) {
	obj, err := s.t.Read(d.ObjectID(), max)
	if err != nil {
		return nil, err
	}
	if obj == nil {
		return nil, ErrIncompleteHistory
	}
	if len(obj.Data) > max {
		return nil, ErrInvalidData
	}
	if ContentDigest(obj.Data) != d {
		return nil, ErrContentAddress
	}
	return s.c.Decrypt(role, obj.Data)
}

func (s *Store) readCommit(d Digest) (*Commit, error) {
	pt, err := s.readImmutable(d, RoleCommit, maxCommitContainer)
	if err != nil {
		return nil, err
	}
	return UnmarshalCommit(pt)
}

type entry struct {
	digest Digest
	commit *Commit
}

// authenticate loads the head commit and, when needed, its ancestry back to
// the checkpoint, and classifies it against the checkpoint.
func (s *Store) authenticate(head Head) ([]entry, error) {
	latest, err := s.readCommit(*head.CommitDigest)
	if err != nil {
		return nil, err
	}
	cp := s.checkpoint
	chain := []entry{{*head.CommitDigest, latest}}
	g := latest.Header.Generation
	if g <= cp.Generation {
		switch ValidateHistory(cp, latest, *head.CommitDigest, nil) {
		case AcceptCurrent:
			return chain, nil
		case Rollback:
			return nil, ErrRollback
		default:
			return nil, ErrFork
		}
	}
	if cp.Generation == 0 || cp.Generation < latest.Header.MinimumRetainedGeneration {
		if ValidateHistory(cp, latest, *head.CommitDigest, nil) != AcceptBaseline {
			return nil, ErrMalformed
		}
		return chain, nil
	}
	if g-cp.Generation > MaxCommitAncestry {
		return nil, ErrTooLarge
	}
	for gen := g; gen > cp.Generation+1; gen-- {
		child := chain[len(chain)-1].commit
		pd := *child.ParentDigest
		parent, err := s.readCommit(pd)
		if err != nil {
			return nil, err
		}
		if !ValidTransition(pd, parent.Header, child) {
			return nil, ErrMalformed
		}
		chain = append(chain, entry{pd, parent})
	}
	anc := make([]AncestryEntry, len(chain))
	for i, e := range chain {
		anc[i] = AncestryEntry{e.digest, e.commit.Header.Generation, e.commit.ParentDigest}
	}
	switch ValidateHistory(cp, latest, *head.CommitDigest, anc) {
	case AcceptDescendant:
		return chain, nil
	case Rollback:
		return nil, ErrRollback
	case Fork:
		return nil, ErrFork
	case IncompleteHistory:
		return nil, ErrIncompleteHistory
	}
	return nil, ErrMalformed
}

func (s *Store) takePayload(c *Commit) ([]byte, error) {
	if len(c.InlinePayload) > 0 {
		return c.InlinePayload, nil
	}
	out := make([]byte, 0, c.ExternalPayloadSize)
	remaining := int(c.ExternalPayloadSize)
	for _, d := range c.ChunkDigests {
		size := min(remaining, MaxPayloadPlaintext)
		pt, err := s.readImmutable(d, RolePayload, MaxEncryptedObject)
		if err != nil {
			return nil, err
		}
		if len(pt) != size {
			return nil, ErrMalformed
		}
		out = append(out, pt...)
		remaining -= size
	}
	return out, nil
}

func (s *Store) reconstruct(chain []entry) ([]byte, error) {
	start := chain[0].commit.Header.EpochStartGeneration
	for chain[len(chain)-1].commit.Header.Generation > start {
		child := chain[len(chain)-1].commit
		pd := *child.ParentDigest
		parent, err := s.readCommit(pd)
		if err != nil {
			return nil, err
		}
		if !ValidTransition(pd, parent.Header, child) {
			return nil, ErrMalformed
		}
		chain = append(chain, entry{pd, parent})
	}
	deltas := int(chain[0].commit.Header.Generation - start)
	state, err := s.takePayload(chain[deltas].commit)
	if err != nil {
		return nil, err
	}
	if err := s.codec.ValidateSnapshot(state); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	for i := deltas - 1; i >= 0; i-- {
		p, err := s.takePayload(chain[i].commit)
		if err != nil {
			return nil, err
		}
		if state, err = s.codec.ApplyDelta(state, p); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrMalformed, err)
		}
	}
	return state, nil
}

func (s *Store) advance(head Head, h CommitHeader) error {
	next := Checkpoint{VaultUUID: s.c.UUID(), Generation: h.Generation, CommitDigest: head.CommitDigest}
	if err := s.persist(next); err != nil {
		return err
	}
	s.checkpoint = next
	return nil
}

func (s *Store) maybeCollect(h CommitHeader) {
	if h.Epoch <= 1 || s.collectedTo >= h.Epoch-1 {
		return
	}
	// Best effort, like Helium: a failure is retried after the next commit.
	if s.t.CollectEpochsBefore(h.Epoch-1) == nil {
		s.collectedTo = h.Epoch - 1
	}
}

func (s *Store) stateForHead(head Head, rev string, loaded *State) (*State, error) {
	if head.CommitDigest == nil {
		if s.checkpoint.Generation != 0 {
			return nil, ErrRollback
		}
		return &State{Head: head, HeadRevision: rev}, nil
	}
	chain, err := s.authenticate(head)
	if err != nil {
		return nil, err
	}
	var data []byte
	if loaded != nil && eqDigest(loaded.Head.CommitDigest, head.CommitDigest) {
		data = loaded.Data
	} else if data, err = s.reconstruct(chain); err != nil {
		return nil, err
	}
	h := chain[0].commit.Header
	if h.Generation > s.checkpoint.Generation {
		if err := s.advance(head, h); err != nil {
			return nil, err
		}
	}
	s.maybeCollect(h)
	return &State{Data: data, Head: head, Header: &h, HeadRevision: rev}, nil
}

// Initialize writes an empty head if the vault has none (idempotent).
func (s *Store) Initialize() error {
	enc, err := s.c.Encrypt(RoleHead, MarshalHead(Head{}))
	if err != nil {
		return err
	}
	_, err = s.t.Write(HeadObjectID, nil, enc, nil)
	if errors.Is(err, ErrConflict) {
		_, _, err = s.readHead() // exists: must at least authenticate
	}
	return err
}

// Read loads and authenticates the current state. loaded, if given, lets an
// unchanged head skip reconstruction.
func (s *Store) Read(loaded *State) (*State, error) {
	head, rev, err := s.readHead()
	if err != nil {
		return nil, err
	}
	return s.stateForHead(head, rev, loaded)
}

func (s *Store) writeImmutable(d Digest, data []byte, epoch uint32) error {
	_, err := s.t.Write(d.ObjectID(), nil, data, &epoch)
	if errors.Is(err, ErrConflict) {
		obj, rerr := s.t.Read(d.ObjectID(), MaxEncryptedObject)
		if rerr == nil && obj != nil && ContentDigest(obj.Data) == d {
			return nil
		}
	}
	return err
}

// Commit publishes snapshot (the full new state) on top of base, using delta
// when it is smaller. It returns ErrConflict if another device moved the head
// first; the caller then reads, merges and retries.
func (s *Store) Commit(base *State, delta, snapshot []byte) (*State, error) {
	if len(snapshot) == 0 || base.Generation() == math.MaxUint64 {
		return nil, ErrInvalidData
	}
	useDelta := base.Generation() > 0 && len(delta) > 0 && len(delta) < len(snapshot)
	var baseEpochBytes, inEpoch uint64
	if base.Header != nil {
		baseEpochBytes = base.Header.EpochPayloadBytes
		inEpoch = base.Header.Generation - base.Header.EpochStartGeneration + 1
	}
	pending := uint64(len(snapshot))
	if useDelta {
		pending = uint64(len(delta))
	}
	target := uint64(len(snapshot)) + max(uint64(minEpochHistoryBytes), uint64(len(snapshot)))
	newEpoch := base.Header != nil && (!useDelta || inEpoch >= EpochCommitTarget || baseEpochBytes+pending >= target)
	payload := snapshot
	if !newEpoch && useDelta {
		payload = delta
	} else if err := s.codec.ValidateSnapshot(snapshot); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidData, err)
	}

	var h CommitHeader
	if base.Header == nil {
		h = CommitHeader{Generation: 1, EpochStartGeneration: 1}
	} else {
		h = *base.Header
		h.Generation++
		if newEpoch {
			if h.Epoch == math.MaxUint32 {
				return nil, ErrTooLarge
			}
			h.Epoch++
			h.EpochStartGeneration = h.Generation
			h.MinimumRetainedGeneration = MinimumRetainedGenerationForEpoch(h.Epoch, base.Header.EpochStartGeneration)
			h.EpochPayloadBytes = 0
		}
	}
	h.EpochPayloadBytes += uint64(len(payload))
	c := &Commit{Header: h, ParentDigest: base.Head.CommitDigest}

	plain, err := s.preparePayload(payload, c)
	if err != nil {
		return nil, err
	}
	encCommit, err := s.c.Encrypt(RoleCommit, plain)
	if err != nil {
		return nil, err
	}
	digest := ContentDigest(encCommit)
	if err := s.writeImmutable(digest, encCommit, h.Epoch); err != nil {
		return nil, err
	}
	newHead := Head{CommitDigest: &digest}
	encHead, err := s.c.Encrypt(RoleHead, MarshalHead(newHead))
	if err != nil {
		return nil, err
	}
	expected := base.HeadRevision
	rev, err := s.t.Write(HeadObjectID, &expected, encHead, nil)
	if err != nil {
		return nil, err
	}
	if err := s.advance(newHead, h); err != nil {
		return nil, err
	}
	s.maybeCollect(h)
	return &State{Data: snapshot, Head: newHead, Header: &h, HeadRevision: rev}, nil
}

func (s *Store) preparePayload(payload []byte, c *Commit) ([]byte, error) {
	if len(payload) <= MaxCommitPlaintext {
		c.InlinePayload = payload
		b, err := MarshalCommit(c)
		if err == nil {
			return b, nil
		}
		if !errors.Is(err, ErrTooLarge) {
			return nil, err
		}
		c.InlinePayload = nil
	}
	for off := 0; off < len(payload); {
		n := min(len(payload)-off, MaxPayloadPlaintext)
		enc, err := s.c.Encrypt(RolePayload, payload[off:off+n])
		if err != nil {
			return nil, err
		}
		d := ContentDigest(enc)
		if err := s.writeImmutable(d, enc, c.Header.Epoch); err != nil {
			return nil, err
		}
		c.ChunkDigests = append(c.ChunkDigests, d)
		off += n
	}
	c.ExternalPayloadSize = uint32(len(payload))
	return MarshalCommit(c)
}
