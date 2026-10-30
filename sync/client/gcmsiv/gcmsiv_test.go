// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package gcmsiv

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
)

func unhex(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// RFC 8452 Appendix A.
func TestPolyvalRFC(t *testing.T) {
	p := newPolyval(unhex(t, "25629347589242761d31f826ba4b757b"))
	p.update(unhex(t, "4f4f95668c83dfb6401762bb2d01a262d1a24ddd2721d006bbe45f20d3c9f362"))
	got := p.sum()
	if want := unhex(t, "f7a3b47b846119fae5b7866cf5e5b77e"); !bytes.Equal(got[:], want) {
		t.Fatalf("POLYVAL = %x, want %x", got, want)
	}
}

func TestRFC8452Vectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/rfc8452.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Vectors []struct{ Key, Nonce, AAD, Plaintext, Result string }
	}
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Vectors) != 26 {
		t.Fatalf("expected 26 vectors, got %d", len(f.Vectors))
	}
	for i, v := range f.Vectors {
		a, err := New(unhex(t, v.Key))
		if err != nil {
			t.Fatal(err)
		}
		nonce, aad, pt, want := unhex(t, v.Nonce), unhex(t, v.AAD), unhex(t, v.Plaintext), unhex(t, v.Result)
		got := a.Seal(nil, nonce, pt, aad)
		if !bytes.Equal(got, want) {
			t.Errorf("vector %d: seal = %x, want %x", i, got, want)
			continue
		}
		back, err := a.Open(nil, nonce, want, aad)
		if err != nil || !bytes.Equal(back, pt) {
			t.Errorf("vector %d: open failed: %v", i, err)
		}
		bad := bytes.Clone(want)
		bad[len(bad)-1] ^= 1
		if _, err := a.Open(nil, nonce, bad, aad); err == nil {
			t.Errorf("vector %d: tampered tag accepted", i)
		}
	}
}
