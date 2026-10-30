// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package vault

import (
	"crypto/hkdf"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"os"
	"reflect"
	"testing"
)

var update = flag.Bool("update", false, "rewrite the test vector files")

const vaultVectorsFile = "../../protocol/vectors-vault.json"

type objectVector struct {
	Role           uint8  `json:"role"`
	AssociatedData string `json:"associated_data_hex"`
	Nonce          string `json:"nonce_hex"`
	Plaintext      string `json:"plaintext_hex"`
	Container      string `json:"container_hex"`
	ObjectID       string `json:"object_id,omitempty"`
}

type vaultVectors struct {
	Note      string         `json:"note"`
	VaultKey  string         `json:"vault_key_hex"`
	VaultUUID string         `json:"vault_uuid"`
	ObjectKey string         `json:"object_key_hex"`
	Objects   []objectVector `json:"objects"`
}

func buildVaultVectors(t *testing.T) vaultVectors {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	c, err := NewCryptographer(key, testUUID)
	if err != nil {
		t.Fatal(err)
	}
	objKey, _ := hkdf.Key(sha256.New, key, []byte(testUUID), keyInfo, 32)
	v := vaultVectors{
		Note:      "Helium-compatible vault objects. Container = nonce || AES-256-GCM-SIV(object_key, nonce, plaintext, associated_data). object_id = hex(SHA-256(container)) for commits and payload chunks.",
		VaultKey:  hex.EncodeToString(key),
		VaultUUID: testUUID,
		ObjectKey: hex.EncodeToString(objKey),
	}
	add := func(role Role, nonceByte byte, pt []byte, immutable bool) Digest {
		c.rand = func(b []byte) {
			for i := range b {
				b[i] = nonceByte
			}
		}
		ct, err := c.Encrypt(role, pt)
		if err != nil {
			t.Fatal(err)
		}
		ov := objectVector{uint8(role), hex.EncodeToString(c.associatedData(role)), hex.EncodeToString(ct[:12]), hex.EncodeToString(pt), hex.EncodeToString(ct), ""}
		d := ContentDigest(ct)
		if immutable {
			ov.ObjectID = d.ObjectID()
		}
		v.Objects = append(v.Objects, ov)
		return d
	}
	add(RoleHead, 0x01, MarshalHead(Head{}), false)
	snap := []byte(`{"format":"corvid-kv-v1","records":{"a":{"v":"MQ==","c":1,"w":"dev_1"}}}`)
	c1, _ := MarshalCommit(&Commit{Header: CommitHeader{Generation: 1, EpochStartGeneration: 1, EpochPayloadBytes: uint64(len(snap))}, InlinePayload: snap})
	d1 := add(RoleCommit, 0x02, c1, true)
	delta := []byte(`{"format":"corvid-kv-v1-delta","records":{"b":{"v":"Mg==","c":2,"w":"dev_1"}}}`)
	c2, _ := MarshalCommit(&Commit{Header: CommitHeader{Generation: 2, EpochStartGeneration: 1, EpochPayloadBytes: uint64(len(snap) + len(delta))}, ParentDigest: &d1, InlinePayload: delta})
	d2 := add(RoleCommit, 0x03, c2, true)
	add(RoleHead, 0x04, MarshalHead(Head{&d2}), false)
	add(RolePayload, 0x05, []byte("payload chunk"), true)
	add(RoleRoster, 0x06, []byte(`{"version":1,"devices":[]}`), false)
	return v
}

func TestVaultVectors(t *testing.T) {
	got := buildVaultVectors(t)
	if *update {
		b, _ := json.MarshalIndent(got, "", " ")
		if err := os.WriteFile(vaultVectorsFile, append(b, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(vaultVectorsFile)
	if err != nil {
		t.Fatal(err)
	}
	var want vaultVectors
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("vault vectors changed; the format is frozen (run with -update only on purpose)")
	}
	// Every container decrypts with the published object key alone.
	key, _ := hex.DecodeString(want.VaultKey)
	c, _ := NewCryptographer(key, want.VaultUUID)
	for i, o := range want.Objects {
		ct, _ := hex.DecodeString(o.Container)
		pt, err := c.Decrypt(Role(o.Role), ct)
		if err != nil || hex.EncodeToString(pt) != o.Plaintext {
			t.Errorf("object %d does not decrypt: %v", i, err)
		}
	}
}
