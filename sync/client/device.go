// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package client

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/lucacraft89/corvid/sync/client/vault"
)

const (
	kindPairRequest = "pair-request"
	labelPairProof  = "corvid-sync-v1/pair-request"
	maxSyncAttempts = 16
)

var (
	ErrNoVault     = errors.New("this device has no vault key yet (create a vault, pair, or use a recovery key)")
	ErrBadInvite   = errors.New("invite code is malformed")
	ErrNotInRoster = errors.New("device is not in the vault's device roster")
)

// Report is an integrity problem the device detected and refused to apply.
type Report struct {
	Time time.Time
	What string
	Err  error
}

// Device is one installation: server credentials, identity key, vault key,
// checkpoint and the local replica.
type Device struct {
	API      *API
	ID       string
	Name     string
	Identity *Identity
	Replica  *Replica
	Reports  []Report

	vaultUUID     string
	vaultName     string
	vaultKey      []byte
	checkpoint    vault.Checkpoint
	rosterVersion uint64
	roster        *Roster // last roster read and authenticated
	store         *vault.Store
	loaded        *vault.State

	invites  map[string][]byte // invite token -> pairing secret (approver side)
	pairings map[string]*Pairing
	// New-device side of a pairing.
	joinSecret   []byte
	joinApprover string
}

// Pairing is a device waiting for approval on the approver side.
type Pairing struct {
	DeviceID string
	Name     string
	Code     string // must match the code shown on the new device
	pub      []byte
	secret   []byte
}

func (d *Device) VaultUUID() string { return d.vaultUUID }
func (d *Device) VaultKey() []byte  { return d.vaultKey }

func (d *Device) report(what string, err error) error {
	if isIntegrityError(err) {
		d.Reports = append(d.Reports, Report{time.Now(), what, err})
	}
	return err
}

func isIntegrityError(err error) bool {
	for _, e := range []error{vault.ErrAuthentication, vault.ErrContentAddress, vault.ErrRollback, vault.ErrFork,
		vault.ErrMalformed, vault.ErrUnsupportedVersion, ErrRosterRollback, ErrEnvelope, ErrNotInRoster} {
		if errors.Is(err, e) {
			return true
		}
	}
	return false
}

// RegisterDevice creates an identity and registers it with a token from the
// server admin or an invite.
func RegisterDevice(serverURL string, hc *http.Client, token, name string) (*Device, error) {
	id, err := NewIdentity()
	if err != nil {
		return nil, err
	}
	reg, err := Register(serverURL, hc, token, name, id.Public())
	if err != nil {
		return nil, err
	}
	return &Device{
		API:      &API{BaseURL: serverURL, Secret: reg.DeviceSecret, HTTP: hc},
		ID:       reg.DeviceID,
		Name:     name,
		Identity: id,
		Replica:  NewReplica(reg.DeviceID),
		invites:  map[string][]byte{},
		pairings: map[string]*Pairing{},
	}, nil
}

func (d *Device) persistCheckpoint(cp vault.Checkpoint) error {
	d.checkpoint = cp
	return nil
}

// adopt switches this device to a vault. The checkpoint restarts at zero.
func (d *Device) adopt(uuid, name string, key []byte) error {
	st, err := vault.NewStore(d.API.Transport(uuid), key, uuid, KVCodec{}, vault.Checkpoint{}, d.persistCheckpoint)
	if err != nil {
		return err
	}
	d.vaultUUID, d.vaultName, d.vaultKey = uuid, name, key
	d.checkpoint = vault.Checkpoint{VaultUUID: uuid}
	d.rosterVersion, d.roster = 0, nil
	d.store, d.loaded = st, nil
	return nil
}

// CreateVault makes a new vault with this device as its only member and
// returns the recovery key the user must save.
func (d *Device) CreateVault(displayName string) (string, error) {
	uuid, key := vault.NewUUID(), vault.NewKey()
	if err := d.API.PutVault(uuid, displayName); err != nil {
		return "", err
	}
	if err := d.adopt(uuid, displayName, key); err != nil {
		return "", err
	}
	if err := d.store.Initialize(); err != nil {
		return "", err
	}
	r, err := updateRoster(d.API.Transport(uuid), d.store.Cryptographer(), 0, func(r *Roster) {
		r.Devices = append(r.Devices, RosterEntry{DeviceID: d.ID, Name: d.Name, PublicKey: d.Identity.Public(), AddedBy: d.ID})
	})
	if err != nil {
		return "", err
	}
	d.rosterVersion = r.Version
	return EncodeRecoveryKey(key), nil
}

// Roster reads the current roster (authenticated, rollback-checked).
func (d *Device) Roster() (*Roster, error) {
	if d.store == nil {
		return nil, ErrNoVault
	}
	r, _, err := readRoster(d.API.Transport(d.vaultUUID), d.store.Cryptographer(), d.rosterVersion)
	if err != nil {
		return nil, d.report("roster", err)
	}
	if r == nil {
		return nil, d.report("roster", fmt.Errorf("%w: roster missing", vault.ErrMalformed))
	}
	d.rosterVersion, d.roster = r.Version, r
	return r, nil
}

func (d *Device) changeRoster(fn func(*Roster)) error {
	r, err := updateRoster(d.API.Transport(d.vaultUUID), d.store.Cryptographer(), d.rosterVersion, fn)
	if err != nil {
		return d.report("roster", err)
	}
	d.rosterVersion = r.Version
	return nil
}

// --- pairing ---

// Invite returns a code for a new device: server token, pairing secret and
// this device's ID. The pairing secret never reaches the server.
func (d *Device) Invite(ttl time.Duration) (string, error) {
	if d.store == nil {
		return "", ErrNoVault
	}
	tok, err := d.API.CreateInviteToken(ttl)
	if err != nil {
		return "", err
	}
	secret := make([]byte, 32)
	rand.Read(secret)
	d.invites[tok] = secret
	return tok + "~" + base64.RawURLEncoding.EncodeToString(secret) + "~" + d.ID, nil
}

func pairProof(secret, newPub []byte) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(labelPairProof))
	m.Write(newPub)
	return m.Sum(nil)
}

// JoinWithInvite registers a new device with an invite code and asks the
// approving device for the vault key.
func JoinWithInvite(serverURL string, hc *http.Client, code, name string) (*Device, error) {
	parts := strings.Split(code, "~")
	if len(parts) != 3 {
		return nil, ErrBadInvite
	}
	secret, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(secret) != 32 {
		return nil, ErrBadInvite
	}
	d, err := RegisterDevice(serverURL, hc, parts[0], name)
	if err != nil {
		return nil, err
	}
	d.joinSecret, d.joinApprover = secret, parts[2]
	proof, _ := json.Marshal(map[string][]byte{"proof": pairProof(secret, d.Identity.Public())})
	if err := d.API.PostMessage(parts[2], kindPairRequest, proof); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *Device) serverPublicKey(id string) ([]byte, string, error) {
	devs, err := d.API.Devices()
	if err != nil {
		return nil, "", err
	}
	for _, x := range devs {
		if x.ID == id && x.Revoked == nil {
			return x.PublicKey, x.Name, nil
		}
	}
	return nil, "", ErrNotFound
}

// ComparisonCode is shown on the new device while it waits for approval.
func (d *Device) ComparisonCode() (string, error) {
	if d.joinSecret == nil {
		return "", errors.New("not pairing")
	}
	pub, _, err := d.serverPublicKey(d.joinApprover)
	if err != nil {
		return "", err
	}
	return ComparisonCode(d.joinSecret, pub, d.Identity.Public()), nil
}

// PendingPairings returns devices that used one of this device's invites.
func (d *Device) PendingPairings() ([]*Pairing, error) {
	if err := d.processMessages(); err != nil {
		return nil, err
	}
	var out []*Pairing
	for _, p := range d.pairings {
		out = append(out, p)
	}
	slices.SortFunc(out, func(a, b *Pairing) int { return strings.Compare(a.DeviceID, b.DeviceID) })
	return out, nil
}

// Approve gives the vault key to a pending device. Call it only after the
// user confirmed that both devices show the same comparison code.
func (d *Device) Approve(deviceID string) error {
	p := d.pairings[deviceID]
	if p == nil {
		return ErrNotFound
	}
	if err := d.changeRoster(func(r *Roster) {
		if r.Find(p.DeviceID) == nil {
			r.Devices = append(r.Devices, RosterEntry{DeviceID: p.DeviceID, Name: p.Name, PublicKey: p.pub, AddedBy: d.ID})
		}
	}); err != nil {
		return err
	}
	env, err := sealEnvelope(d.Identity, p.pub, p.secret, KindVaultKey, VaultGrant{d.vaultUUID, d.vaultKey, d.vaultName, ""}, nil)
	if err != nil {
		return err
	}
	if err := d.API.PostMessage(p.DeviceID, KindVaultKey, env); err != nil {
		return err
	}
	delete(d.pairings, deviceID)
	return nil
}

// RecoverWithKey finds the vault that the recovery key opens and joins it.
func (d *Device) RecoverWithKey(recoveryKey string) error {
	key, err := DecodeRecoveryKey(recoveryKey)
	if err != nil {
		return err
	}
	vaults, err := d.API.Vaults()
	if err != nil {
		return err
	}
	for _, v := range vaults {
		st, err := vault.NewStore(d.API.Transport(v.UUID), key, v.UUID, KVCodec{}, vault.Checkpoint{}, nil)
		if err != nil {
			continue
		}
		if _, err := st.Read(nil); err != nil && !errors.Is(err, vault.ErrNotInitialized) {
			continue // not this vault (or unreadable)
		}
		if err := d.adopt(v.UUID, v.DisplayName, key); err != nil {
			return err
		}
		return d.changeRoster(func(r *Roster) {
			if r.Find(d.ID) == nil {
				r.Devices = append(r.Devices, RosterEntry{DeviceID: d.ID, Name: d.Name, PublicKey: d.Identity.Public(), AddedBy: "recovery-key"})
			}
		})
	}
	return d.report("recovery", fmt.Errorf("%w: the recovery key opens none of this account's vaults", vault.ErrAuthentication))
}

// --- revocation ---

// Revoke removes a device: the server stops serving it at once, then this
// device moves everyone else to a new vault with a new key, so data written
// from now on is unreadable with the old key. Returns the new recovery key.
func (d *Device) Revoke(deviceID string) (string, error) {
	if d.store == nil {
		return "", ErrNoVault
	}
	if err := d.API.RevokeDevice(deviceID); err != nil {
		return "", err
	}
	if err := d.changeRoster(func(r *Roster) {
		if e := r.Find(deviceID); e != nil {
			e.Revoked = true
		}
	}); err != nil {
		return "", err
	}
	if err := d.Sync(); err != nil { // pull the latest state before moving
		return "", err
	}
	old, err := d.Roster()
	if err != nil {
		return "", err
	}
	oldUUID, oldKey := d.vaultUUID, d.vaultKey
	newUUID, newKey := vault.NewUUID(), vault.NewKey()
	if err := d.API.PutVault(newUUID, d.vaultName); err != nil {
		return "", err
	}
	if err := d.adopt(newUUID, d.vaultName, newKey); err != nil {
		return "", err
	}
	if err := d.store.Initialize(); err != nil {
		return "", err
	}
	if err := d.changeRoster(func(r *Roster) {
		for _, e := range old.Devices {
			if !e.Revoked {
				r.Devices = append(r.Devices, e)
			}
		}
	}); err != nil {
		return "", err
	}
	d.Replica.rebaseAll()
	if err := d.Sync(); err != nil {
		return "", err
	}
	salt := rotationSalt(oldKey, oldUUID)
	for _, e := range old.Devices {
		if e.Revoked || e.DeviceID == d.ID {
			continue
		}
		env, err := sealEnvelope(d.Identity, e.PublicKey, salt, KindVaultRotate, VaultGrant{newUUID, newKey, d.vaultName, oldUUID}, nil)
		if err != nil {
			return "", err
		}
		if err := d.API.PostMessage(e.DeviceID, KindVaultRotate, env); err != nil && !errors.Is(err, ErrNotFound) {
			return "", err
		}
	}
	if err := d.API.DeleteVault(oldUUID); err != nil && !errors.Is(err, ErrNotFound) {
		return "", err
	}
	return EncodeRecoveryKey(newKey), nil
}

// --- messages ---

func (d *Device) processMessages() error {
	msgs, err := d.API.Messages()
	if err != nil {
		return err
	}
	for _, m := range msgs {
		if err := d.handleMessage(m); err != nil {
			d.report("message "+m.Kind+" from "+m.FromDevice, err)
			if !isIntegrityError(err) {
				return err // transient: keep the message for the next attempt
			}
		}
		if err := d.API.DeleteMessage(m.ID); err != nil {
			return err
		}
	}
	return nil
}

func (d *Device) handleMessage(m Message) error {
	switch m.Kind {
	case kindPairRequest:
		var body struct{ Proof []byte }
		if json.Unmarshal(m.Data, &body) != nil {
			return ErrEnvelope
		}
		pub, name, err := d.serverPublicKey(m.FromDevice)
		if err != nil {
			return err
		}
		for tok, secret := range d.invites {
			if hmac.Equal(body.Proof, pairProof(secret, pub)) {
				delete(d.invites, tok)
				d.pairings[m.FromDevice] = &Pairing{m.FromDevice, name, ComparisonCode(secret, d.Identity.Public(), pub), pub, secret}
				return nil
			}
		}
		return fmt.Errorf("%w: pair request matches no open invite", ErrEnvelope)
	case KindVaultKey:
		if d.joinSecret == nil || m.FromDevice != d.joinApprover {
			return fmt.Errorf("%w: unexpected vault key", ErrEnvelope)
		}
		pub, _, err := d.serverPublicKey(m.FromDevice)
		if err != nil {
			return err
		}
		g, err := openEnvelope(d.Identity, pub, d.joinSecret, KindVaultKey, m.Data)
		if err != nil {
			return err
		}
		if err := d.adopt(g.VaultUUID, g.DisplayName, g.VaultKey); err != nil {
			return err
		}
		r, err := d.Roster()
		if err != nil {
			return err
		}
		if e := r.Find(d.ID); e == nil || e.Revoked {
			return ErrNotInRoster
		}
		d.joinSecret, d.joinApprover = nil, ""
		return nil
	case KindVaultRotate:
		if d.store == nil {
			return fmt.Errorf("%w: rotation without a vault", ErrEnvelope)
		}
		// The rotating device deletes the old vault; fall back to the last
		// roster this device authenticated.
		r, err := d.Roster()
		if errors.Is(err, ErrNotFound) {
			r = d.roster
		} else if err != nil {
			return err
		}
		if r == nil {
			return fmt.Errorf("%w: cannot read the old roster to check the sender", ErrNotInRoster)
		}
		sender := r.Find(m.FromDevice)
		if sender == nil || sender.Revoked {
			return fmt.Errorf("%w: rotation from %s", ErrNotInRoster, m.FromDevice)
		}
		g, err := openEnvelope(d.Identity, sender.PublicKey, rotationSalt(d.vaultKey, d.vaultUUID), KindVaultRotate, m.Data)
		if err != nil {
			return err
		}
		if g.ReplacesUUID != d.vaultUUID {
			return fmt.Errorf("%w: rotation for another vault", ErrEnvelope)
		}
		if err := d.adopt(g.VaultUUID, g.DisplayName, g.VaultKey); err != nil {
			return err
		}
		d.Replica.rebaseAll()
		nr, err := d.Roster()
		if err != nil {
			return err
		}
		if e := nr.Find(d.ID); e == nil || e.Revoked {
			return ErrNotInRoster
		}
		return nil
	}
	return fmt.Errorf("%w: unknown message kind %q", ErrEnvelope, m.Kind)
}

// --- sync ---

// Sync handles key messages, then pulls, merges local edits and publishes.
// Integrity errors are recorded in Reports and nothing is applied.
func (d *Device) Sync() error {
	if err := d.processMessages(); err != nil {
		return err
	}
	if d.store == nil {
		return ErrNoVault
	}
	for range maxSyncAttempts {
		st, err := d.store.Read(d.loaded)
		if errors.Is(err, ErrNotFound) {
			// The vault may have been rotated away; a key message may be waiting.
			before := d.vaultUUID
			if perr := d.processMessages(); perr != nil {
				return perr
			}
			if d.vaultUUID != before {
				continue
			}
		}
		if err != nil {
			return d.report("sync", err)
		}
		remote := map[string]Record{}
		if st.Generation() > 0 {
			if remote, err = decodeKV(st.Data, kvSnapshotFormat); err != nil {
				return d.report("sync", fmt.Errorf("%w: %v", vault.ErrMalformed, err))
			}
		}
		merged, delta := d.Replica.merge(remote)
		if len(delta) == 0 {
			d.Replica.synced, d.Replica.pending, d.loaded = merged, map[string]Record{}, st
			_, err := d.Roster()
			return err
		}
		next, err := d.store.Commit(st, encodeKV(kvDeltaFormat, delta), encodeKV(kvSnapshotFormat, merged))
		if errors.Is(err, vault.ErrConflict) {
			d.loaded = st
			continue
		}
		if err != nil {
			return d.report("sync", err)
		}
		d.Replica.synced, d.Replica.pending, d.loaded = merged, map[string]Record{}, next
		_, err = d.Roster()
		return err
	}
	return vault.ErrConflict
}
