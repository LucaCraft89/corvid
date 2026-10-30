// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package vault

import (
	"bytes"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// memTransport is an in-memory server with the same conditional-write rules.
type memTransport struct {
	mu      sync.Mutex
	objects map[string]*Object
	epochs  map[string]uint32
	n       int
}

func newMem() *memTransport {
	return &memTransport{objects: map[string]*Object{}, epochs: map[string]uint32{}}
}

func (m *memTransport) Read(id string, max int) (*Object, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	o := m.objects[id]
	if o == nil {
		return nil, nil
	}
	return &Object{Data: bytes.Clone(o.Data), Revision: o.Revision}, nil
}

func (m *memTransport) Write(id string, expected *string, data []byte, epoch *uint32) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	cur := m.objects[id]
	if (expected == nil && cur != nil) || (expected != nil && (cur == nil || cur.Revision != *expected)) {
		return "", ErrConflict
	}
	m.n++
	rev := fmt.Sprintf("r%d", m.n)
	m.objects[id] = &Object{Data: bytes.Clone(data), Revision: rev}
	if epoch != nil {
		m.epochs[id] = *epoch
	}
	return rev, nil
}

func (m *memTransport) CollectEpochsBefore(e uint32) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, ep := range m.epochs {
		if ep < e {
			delete(m.objects, id)
			delete(m.epochs, id)
		}
	}
	return nil
}

// appendCodec: the state is a byte string, a delta is appended to it.
type appendCodec struct{}

func (appendCodec) ValidateSnapshot(s []byte) error { return nil }
func (appendCodec) ApplyDelta(state, delta []byte) ([]byte, error) {
	return append(bytes.Clone(state), delta...), nil
}

const testUUID = "0f8e7a3c-2b1d-4c5e-9f60-718293a4b5c6"

func open(t *testing.T, m Transport, key []byte, cp Checkpoint) *Store {
	t.Helper()
	s, err := NewStore(m, key, testUUID, appendCodec{}, cp, nil)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func commitN(t *testing.T, s *Store, n int, tag string) *State {
	t.Helper()
	st, err := s.Read(nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < n; i++ {
		d := []byte(fmt.Sprintf("%s%d;", tag, i))
		if st, err = s.Commit(st, d, append(bytes.Clone(st.Data), d...)); err != nil {
			t.Fatalf("commit %d: %v", i, err)
		}
	}
	return st
}

func TestRoundTripEpochsAndCollection(t *testing.T) {
	m, key := newMem(), NewKey()
	a := open(t, m, key, Checkpoint{})
	if err := a.Initialize(); err != nil {
		t.Fatal(err)
	}
	st := commitN(t, a, 200, "x")
	if st.Header.Epoch < 2 {
		t.Fatalf("expected epoch rollover, epoch=%d", st.Header.Epoch)
	}
	// Old epochs were collected but the vault still reconstructs.
	before := len(m.objects)
	if before > 2*EpochCommitTarget+2 {
		t.Fatalf("collection left %d objects", before)
	}
	b := open(t, m, key, Checkpoint{})
	got, err := b.Read(nil)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got.Data, st.Data) || got.Generation() != 200 {
		t.Fatalf("fresh reader: generation %d, data mismatch=%v", got.Generation(), !bytes.Equal(got.Data, st.Data))
	}
	// A reader with a recent checkpoint follows the ancestry.
	cp := b.Checkpoint()
	commitN(t, a, 10, "y")
	c := open(t, m, key, cp)
	if _, err := c.Read(nil); err != nil {
		t.Fatalf("descendant read: %v", err)
	}
}

func TestLargePayloadUsesChunks(t *testing.T) {
	m, key := newMem(), NewKey()
	s := open(t, m, key, Checkpoint{})
	s.Initialize()
	st, _ := s.Read(nil)
	big := make([]byte, MaxCommitPlaintext+1000)
	rand.Read(big)
	st, err := s.Commit(st, nil, big)
	if err != nil {
		t.Fatal(err)
	}
	got, err := open(t, m, key, Checkpoint{}).Read(nil)
	if err != nil || !bytes.Equal(got.Data, big) {
		t.Fatalf("chunked read failed: %v", err)
	}
	if len(m.objects) != 3 { // head, commit, one chunk
		t.Fatalf("objects = %d, want 3", len(m.objects))
	}
}

func TestRejectsTamperingWrongKeyRollbackFork(t *testing.T) {
	m, key := newMem(), NewKey()
	a := open(t, m, key, Checkpoint{})
	a.Initialize()
	commitN(t, a, 3, "a")
	oldHead := bytes.Clone(m.objects[HeadObjectID].Data)
	commitN(t, a, 2, "b")

	if _, err := open(t, m, NewKey(), Checkpoint{}).Read(nil); !errors.Is(err, ErrAuthentication) {
		t.Errorf("wrong key: got %v", err)
	}

	// Flip one byte of the newest commit object on the "server".
	head, _, _ := a.readHead()
	id := head.CommitDigest.ObjectID()
	saved := bytes.Clone(m.objects[id].Data)
	m.objects[id].Data[40] ^= 1
	if _, err := open(t, m, key, Checkpoint{}).Read(nil); !errors.Is(err, ErrContentAddress) {
		t.Errorf("tampered commit: got %v", err)
	}
	m.objects[id].Data = saved

	savedHead := bytes.Clone(m.objects[HeadObjectID].Data)
	m.objects[HeadObjectID].Data[20] ^= 1
	if _, err := open(t, m, key, Checkpoint{}).Read(nil); !errors.Is(err, ErrAuthentication) {
		t.Errorf("tampered head: got %v", err)
	}
	// A head moved to another role (a commit object) must not authenticate.
	m.objects[HeadObjectID].Data = saved
	if _, err := open(t, m, key, Checkpoint{}).Read(nil); !errors.Is(err, ErrAuthentication) && !errors.Is(err, ErrTooLarge) {
		t.Errorf("commit replayed as head: got %v", err)
	}
	m.objects[HeadObjectID].Data = savedHead

	// The server serves an older (genuine) head to a device that saw newer.
	cp := a.Checkpoint()
	m.objects[HeadObjectID].Data = oldHead
	if _, err := open(t, m, key, cp).Read(nil); !errors.Is(err, ErrRollback) {
		t.Errorf("rollback: got %v", err)
	}
	m.objects[HeadObjectID].Data = savedHead

	// Fork: a second history with the same key diverges from the checkpoint.
	m2 := newMem()
	f := open(t, m2, key, Checkpoint{})
	f.Initialize()
	commitN(t, f, 6, "fork")
	if _, err := open(t, m2, key, cp).Read(nil); !errors.Is(err, ErrFork) {
		t.Errorf("fork: got %v", err)
	}
}

func TestConcurrentCommitConflicts(t *testing.T) {
	m, key := newMem(), NewKey()
	a, b := open(t, m, key, Checkpoint{}), open(t, m, key, Checkpoint{})
	a.Initialize()
	sa, _ := a.Read(nil)
	sb, _ := b.Read(nil)
	if _, err := a.Commit(sa, nil, []byte("A")); err != nil {
		t.Fatal(err)
	}
	if _, err := b.Commit(sb, nil, []byte("B")); !errors.Is(err, ErrConflict) {
		t.Fatalf("second writer on a stale head: got %v, want ErrConflict", err)
	}
}

// TestProtoMatchesProtoc checks our hand-written protobuf encoding against
// protoc and Helium's sync_vault.proto. Set CORVID_PROTOC and
// CORVID_VAULT_PROTO to run it (protoc is in the Chromium build output).
func TestProtoMatchesProtoc(t *testing.T) {
	protoc, proto := os.Getenv("CORVID_PROTOC"), os.Getenv("CORVID_VAULT_PROTO")
	if protoc == "" || proto == "" {
		t.Skip("CORVID_PROTOC / CORVID_VAULT_PROTO not set")
	}
	var d1, d2 Digest
	for i := range d1 {
		d1[i], d2[i] = byte(i), byte(0xff-i)
	}
	commit := &Commit{Header: CommitHeader{Generation: 70, Epoch: 2, EpochStartGeneration: 65, MinimumRetainedGeneration: 1, EpochPayloadBytes: 300}, ParentDigest: &d1, InlinePayload: []byte("payload")}
	chunked := &Commit{Header: CommitHeader{Generation: 1, EpochStartGeneration: 1, EpochPayloadBytes: 20000000}, ExternalPayloadSize: 20000000, ChunkDigests: []Digest{d1, d2}}
	cb, err := MarshalCommit(commit)
	if err != nil {
		t.Fatal(err)
	}
	ch, err := MarshalCommit(chunked)
	if err != nil {
		t.Fatal(err)
	}
	cpb, _ := MarshalCheckpoint(Checkpoint{testUUID, 70, &d1})
	esc := func(d Digest) string {
		var sb strings.Builder
		for _, b := range d {
			fmt.Fprintf(&sb, "\\%03o", b)
		}
		return sb.String()
	}
	cases := []struct {
		msg, text string
		want      []byte
	}{
		{"SyncVaultHead", `format_version: 1 commit_digest: "` + esc(d1) + `"`, MarshalHead(Head{&d1})},
		{"SyncVaultHead", `format_version: 1`, MarshalHead(Head{})},
		{"SyncVaultCommit", `format_version: 1 generation: 70 parent_commit_digest: "` + esc(d1) + `" epoch: 2 epoch_start_generation: 65 minimum_retained_generation: 1 epoch_payload_bytes: 300 inline_payload: "payload"`, cb},
		{"SyncVaultCommit", `format_version: 1 generation: 1 epoch: 0 epoch_start_generation: 1 minimum_retained_generation: 0 epoch_payload_bytes: 20000000 payload_chunk_digests: "` + esc(d1) + `" payload_chunk_digests: "` + esc(d2) + `" external_payload_size: 20000000`, ch},
		{"SyncVaultCheckpoint", `format_version: 1 vault_uuid: "` + testUUID + `" generation: 70 commit_digest: "` + esc(d1) + `"`, cpb},
	}
	dir, base := filepath.Split(proto)
	for _, c := range cases {
		cmd := exec.Command(protoc, "-I", dir, "--encode=sync_pb."+c.msg, base)
		cmd.Stdin = strings.NewReader(c.text)
		out, err := cmd.Output()
		if err != nil {
			t.Fatalf("protoc %s: %v", c.msg, err)
		}
		if !bytes.Equal(out, c.want) {
			t.Errorf("%s: ours %x, protoc %x", c.msg, c.want, out)
		}
	}
	// And our parser reads protoc's bytes back.
	if back, err := UnmarshalCommit(cb); err != nil || back.Header != commit.Header {
		t.Errorf("parse back: %v", err)
	}
}
