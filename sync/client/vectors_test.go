// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package client

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"flag"
	"os"
	"reflect"
	"testing"
)

var update = flag.Bool("update", false, "rewrite the test vector files")

const pairingVectorsFile = "../protocol/vectors-pairing.json"

type pairingVectors struct {
	Note             string     `json:"note"`
	VaultKey         string     `json:"vault_key_hex"`
	RecoveryKey      string     `json:"recovery_key"`
	PairSecret       string     `json:"pair_secret_hex"`
	ApproverPrivate  string     `json:"approver_private_hex"`
	ApproverPublic   string     `json:"approver_public_hex"`
	NewDevicePrivate string     `json:"new_device_private_hex"`
	NewDevicePublic  string     `json:"new_device_public_hex"`
	PairProof        string     `json:"pair_proof_hex"`
	ComparisonCode   string     `json:"comparison_code"`
	Grant            VaultGrant `json:"grant"`
	EnvelopeNonce    string     `json:"envelope_nonce_hex"`
	VaultKeyEnvelope string     `json:"vault_key_envelope_hex"`
	OldVaultUUID     string     `json:"old_vault_uuid"`
	RotationSalt     string     `json:"rotation_salt_hex"`
	RotationEnvelope string     `json:"rotation_envelope_hex"`
}

func fill(n int, b byte) []byte { return bytes.Repeat([]byte{b}, n) }

func buildPairingVectors(t *testing.T) pairingVectors {
	key := fill(32, 0x11)
	secret := fill(32, 0x22)
	approver, err := IdentityFromBytes(fill(32, 0x33))
	if err != nil {
		t.Fatal(err)
	}
	newDev, _ := IdentityFromBytes(fill(32, 0x44))
	nonce := fill(12, 0x55)
	oldUUID := "0f8e7a3c-2b1d-4c5e-9f60-718293a4b5c6"
	g := VaultGrant{VaultUUID: "6b1f0c2e-7d3a-4e5b-8c9d-0a1b2c3d4e5f", VaultKey: key, DisplayName: "Alice"}
	env, err := sealEnvelope(approver, newDev.Public(), secret, KindVaultKey, g, nonce)
	if err != nil {
		t.Fatal(err)
	}
	salt := rotationSalt(fill(32, 0x66), oldUUID)
	rg := g
	rg.ReplacesUUID = oldUUID
	renv, _ := sealEnvelope(approver, newDev.Public(), salt, KindVaultRotate, rg, nonce)
	return pairingVectors{
		Note:             "Corvid additions: recovery key, pairing proof, comparison code, key envelopes. X25519 keys are raw 32-byte scalars. Envelope = nonce || AES-256-GCM(HKDF-SHA256(X25519(sender, recipient), salt, info), nonce, JSON grant, label).",
		VaultKey:         hex.EncodeToString(key),
		RecoveryKey:      EncodeRecoveryKey(key),
		PairSecret:       hex.EncodeToString(secret),
		ApproverPrivate:  hex.EncodeToString(approver.Private.Bytes()),
		ApproverPublic:   hex.EncodeToString(approver.Public()),
		NewDevicePrivate: hex.EncodeToString(newDev.Private.Bytes()),
		NewDevicePublic:  hex.EncodeToString(newDev.Public()),
		PairProof:        hex.EncodeToString(pairProof(secret, newDev.Public())),
		ComparisonCode:   ComparisonCode(secret, approver.Public(), newDev.Public()),
		Grant:            g,
		EnvelopeNonce:    hex.EncodeToString(nonce),
		VaultKeyEnvelope: hex.EncodeToString(env),
		OldVaultUUID:     oldUUID,
		RotationSalt:     hex.EncodeToString(salt),
		RotationEnvelope: hex.EncodeToString(renv),
	}
}

func TestPairingVectors(t *testing.T) {
	got := buildPairingVectors(t)
	if *update {
		b, _ := json.MarshalIndent(got, "", " ")
		if err := os.WriteFile(pairingVectorsFile, append(b, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(pairingVectorsFile)
	if err != nil {
		t.Fatal(err)
	}
	var want pairingVectors
	if err := json.Unmarshal(raw, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("pairing vectors changed (run with -update only on purpose)")
	}
	// The recipient side opens the published envelope.
	newDev, _ := IdentityFromBytes(fill(32, 0x44))
	approverPub, _ := hex.DecodeString(want.ApproverPublic)
	env, _ := hex.DecodeString(want.VaultKeyEnvelope)
	g, err := openEnvelope(newDev, approverPub, fill(32, 0x22), KindVaultKey, env)
	if err != nil || !reflect.DeepEqual(*g, want.Grant) {
		t.Fatalf("open envelope: %v", err)
	}
	if _, err := openEnvelope(newDev, approverPub, fill(32, 0x23), KindVaultKey, env); err == nil {
		t.Fatal("envelope opened with the wrong pairing secret")
	}
	if _, err := openEnvelope(newDev, approverPub, fill(32, 0x22), KindVaultRotate, env); err == nil {
		t.Fatal("envelope opened as the wrong kind")
	}
	k, err := DecodeRecoveryKey(want.RecoveryKey)
	if err != nil || hex.EncodeToString(k) != want.VaultKey {
		t.Fatalf("recovery key round trip: %v", err)
	}
}
