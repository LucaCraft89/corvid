// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package client

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/lucacraft89/corvid/sync/client/vault"
)

// Roster is the list of devices that hold the vault key, stored in the vault
// as the mutable object "roster" (role 16), encrypted like the head. Devices
// trust it, not the server's device list, when they decide who may hand
// them a rotated key.
type Roster struct {
	Version uint64        `json:"version"`
	Devices []RosterEntry `json:"devices"`
}

type RosterEntry struct {
	DeviceID  string `json:"device_id"`
	Name      string `json:"name"`
	PublicKey []byte `json:"public_key"`
	AddedBy   string `json:"added_by"`
	Revoked   bool   `json:"revoked,omitempty"`
}

const RosterObjectID = "roster"

var ErrRosterRollback = errors.New("server returned an older device roster than this device already saw (rollback)")

func (r *Roster) Find(id string) *RosterEntry {
	for i := range r.Devices {
		if r.Devices[i].DeviceID == id {
			return &r.Devices[i]
		}
	}
	return nil
}

// readRoster returns the roster and its revision; nil if absent.
func readRoster(t vault.Transport, c *vault.Cryptographer, minVersion uint64) (*Roster, string, error) {
	obj, err := t.Read(RosterObjectID, vault.MaxMetadataPlaintext+vault.ContainerOverhead)
	if err != nil || obj == nil {
		return nil, "", err
	}
	pt, err := c.Decrypt(vault.RoleRoster, obj.Data)
	if err != nil {
		return nil, "", err
	}
	var r Roster
	if err := json.Unmarshal(pt, &r); err != nil {
		return nil, "", fmt.Errorf("%w: roster: %v", vault.ErrMalformed, err)
	}
	if r.Version < minVersion {
		return nil, "", ErrRosterRollback
	}
	return &r, obj.Revision, nil
}

func writeRoster(t vault.Transport, c *vault.Cryptographer, r *Roster, expected *string) (string, error) {
	pt, err := json.Marshal(r)
	if err != nil {
		return "", err
	}
	enc, err := c.Encrypt(vault.RoleRoster, pt)
	if err != nil {
		return "", err
	}
	return t.Write(RosterObjectID, expected, enc, nil)
}

// updateRoster applies fn with compare-and-swap, retrying on conflict.
func updateRoster(t vault.Transport, c *vault.Cryptographer, minVersion uint64, fn func(*Roster)) (*Roster, error) {
	for range 8 {
		r, rev, err := readRoster(t, c, minVersion)
		if err != nil {
			return nil, err
		}
		var expected *string
		if r == nil {
			r = &Roster{}
		} else {
			expected = &rev
		}
		fn(r)
		r.Version++
		if _, err = writeRoster(t, c, r, expected); err == nil {
			return r, nil
		}
		if !errors.Is(err, vault.ErrConflict) {
			return nil, err
		}
	}
	return nil, vault.ErrConflict
}
