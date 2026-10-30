// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package client

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"slices"
)

// The "corvid-kv-v1" payload: a map of records merged last-writer-wins by
// (Lamport clock, device ID). It is what the reference client and the tests
// sync. The browser syncs Helium's loopback-server payload instead.

type Record struct {
	Value   []byte `json:"v,omitempty"`
	Deleted bool   `json:"d,omitempty"`
	Clock   uint64 `json:"c"`
	Device  string `json:"w"`
}

// wins reports whether a beats b.
func (a Record) wins(b Record) bool {
	if a.Clock != b.Clock {
		return a.Clock > b.Clock
	}
	return a.Device > b.Device
}

type kvDoc struct {
	Format  string            `json:"format"`
	Records map[string]Record `json:"records"`
}

const (
	kvSnapshotFormat = "corvid-kv-v1"
	kvDeltaFormat    = "corvid-kv-v1-delta"
)

func encodeKV(format string, recs map[string]Record) []byte {
	b, _ := json.Marshal(kvDoc{format, recs}) // map keys are sorted: deterministic
	return b
}

func decodeKV(b []byte, format string) (map[string]Record, error) {
	var d kvDoc
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, err
	}
	if d.Format != format {
		return nil, fmt.Errorf("payload format %q, want %q", d.Format, format)
	}
	if d.Records == nil {
		d.Records = map[string]Record{}
	}
	for k, r := range d.Records {
		if k == "" || r.Device == "" || r.Clock == 0 {
			return nil, errors.New("invalid record")
		}
	}
	return d.Records, nil
}

// KVCodec implements vault.Codec for corvid-kv-v1.
type KVCodec struct{}

func (KVCodec) ValidateSnapshot(s []byte) error {
	_, err := decodeKV(s, kvSnapshotFormat)
	return err
}

func (KVCodec) ApplyDelta(state, delta []byte) ([]byte, error) {
	base, err := decodeKV(state, kvSnapshotFormat)
	if err != nil {
		return nil, err
	}
	d, err := decodeKV(delta, kvDeltaFormat)
	if err != nil {
		return nil, err
	}
	maps.Copy(base, d)
	return encodeKV(kvSnapshotFormat, base), nil
}

// Replica is one device's copy: the last synced state plus local edits not
// yet published. Edits work offline.
type Replica struct {
	device  string
	clock   uint64
	synced  map[string]Record
	pending map[string]Record
}

func NewReplica(deviceID string) *Replica {
	return &Replica{device: deviceID, synced: map[string]Record{}, pending: map[string]Record{}}
}

func (r *Replica) tick() uint64 { r.clock++; return r.clock }

func (r *Replica) Set(key string, value []byte) {
	r.pending[key] = Record{Value: append([]byte(nil), value...), Clock: r.tick(), Device: r.device}
}

func (r *Replica) Delete(key string) {
	r.pending[key] = Record{Deleted: true, Clock: r.tick(), Device: r.device}
}

func (r *Replica) Get(key string) ([]byte, bool) {
	rec, ok := r.pending[key]
	if !ok {
		rec, ok = r.synced[key]
	}
	if !ok || rec.Deleted {
		return nil, false
	}
	return rec.Value, true
}

// Snapshot returns the visible key/value pairs, sorted by key.
func (r *Replica) Snapshot() map[string]string {
	out := map[string]string{}
	for _, k := range slices.Sorted(maps.Keys(r.synced)) {
		if v, ok := r.Get(k); ok {
			out[k] = string(v)
		}
	}
	for k := range r.pending {
		if v, ok := r.Get(k); ok {
			out[k] = string(v)
		}
	}
	return out
}

func (r *Replica) Pending() int { return len(r.pending) }

// merge folds remote state with local edits. It returns the merged snapshot
// and the delta of local edits that won.
func (r *Replica) merge(remote map[string]Record) (merged, delta map[string]Record) {
	merged = maps.Clone(remote)
	delta = map[string]Record{}
	for _, rec := range remote {
		r.clock = max(r.clock, rec.Clock)
	}
	for k, p := range r.pending {
		if cur, ok := merged[k]; !ok || p.wins(cur) {
			merged[k] = p
			delta[k] = p
		}
	}
	return merged, delta
}

// resetPending moves all edits back to pending after a vault switch, so they
// are published into the new vault.
func (r *Replica) rebaseAll() {
	for k, v := range r.synced {
		if _, ok := r.pending[k]; !ok {
			r.pending[k] = v
		}
	}
	r.synced = map[string]Record{}
}
