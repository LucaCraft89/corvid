// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Package client is the reference client for the Corvid sync protocol
// (sync/protocol/SPEC.md): server API, device pairing, key rotation and a
// small key-value payload used by tests and tools. The browser keeps
// Helium's engine and payload; it shares the vault layer (package vault).
package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/lucacraft89/corvid/sync/client/vault"
)

// APIError is a non-2xx answer from the server.
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("server: %d %s %s", e.Status, e.Code, e.Message)
}

var (
	ErrDeviceRevoked = errors.New("this device was revoked on the server")
	ErrNotFound      = errors.New("not found on the server")
)

// API talks to one server as one device.
type API struct {
	BaseURL string
	Secret  string
	HTTP    *http.Client
}

func (a *API) client() *http.Client {
	if a.HTTP != nil {
		return a.HTTP
	}
	return http.DefaultClient
}

func (a *API) do(method, path string, hdr http.Header, body []byte) (*http.Response, []byte, error) {
	req, err := http.NewRequest(method, strings.TrimRight(a.BaseURL, "/")+path, bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	for k, v := range hdr {
		req.Header[k] = v
	}
	if a.Secret != "" {
		req.Header.Set("Authorization", "Bearer "+a.Secret)
	}
	resp, err := a.client().Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, vault.MaxEncryptedObject+1))
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode >= 300 {
		e := &APIError{Status: resp.StatusCode}
		var body struct{ Error, Message string }
		if json.Unmarshal(data, &body) == nil {
			e.Code, e.Message = body.Error, body.Message
		}
		switch {
		case e.Code == "device_revoked":
			return resp, nil, fmt.Errorf("%w: %w", ErrDeviceRevoked, e)
		case resp.StatusCode == 404:
			return resp, nil, fmt.Errorf("%w: %w", ErrNotFound, e)
		case resp.StatusCode == 412:
			return resp, nil, fmt.Errorf("%w: %w", vault.ErrConflict, e)
		}
		return resp, nil, e
	}
	return resp, data, nil
}

func (a *API) json(method, path string, in, out any) error {
	var body []byte
	hdr := http.Header{}
	if in != nil {
		var err error
		if body, err = json.Marshal(in); err != nil {
			return err
		}
		hdr.Set("Content-Type", "application/json")
	}
	_, data, err := a.do(method, path, hdr, body)
	if err != nil || out == nil {
		return err
	}
	return json.Unmarshal(data, out)
}

type Registration struct {
	Account      string `json:"account"`
	DeviceID     string `json:"device_id"`
	DeviceSecret string `json:"device_secret"`
}

// Register consumes a registration token.
func Register(baseURL string, hc *http.Client, token, name string, publicKey []byte) (*Registration, error) {
	a := &API{BaseURL: baseURL, HTTP: hc}
	var r Registration
	err := a.json("POST", "/v1/register", map[string]any{"token": token, "name": name, "public_key": publicKey}, &r)
	return &r, err
}

type DeviceInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	PublicKey []byte `json:"public_key"`
	Created   int64  `json:"created"`
	LastSeen  int64  `json:"last_seen"`
	Revoked   *int64 `json:"revoked,omitempty"`
}

func (a *API) Devices() ([]DeviceInfo, error) {
	var r struct{ Devices []DeviceInfo }
	err := a.json("GET", "/v1/devices", nil, &r)
	return r.Devices, err
}

func (a *API) RevokeDevice(id string) error {
	return a.json("DELETE", "/v1/devices/"+url.PathEscape(id), nil, nil)
}

func (a *API) CreateInviteToken(ttl time.Duration) (string, error) {
	var r struct{ Token string }
	err := a.json("POST", "/v1/invites", map[string]int64{"ttl_seconds": int64(ttl / time.Second)}, &r)
	return r.Token, err
}

type VaultInfo struct {
	UUID        string `json:"vault_uuid"`
	DisplayName string `json:"display_name"`
}

func (a *API) Vaults() ([]VaultInfo, error) {
	var r struct{ Vaults []VaultInfo }
	err := a.json("GET", "/v1/vaults", nil, &r)
	return r.Vaults, err
}

func (a *API) PutVault(uuid, name string) error {
	return a.json("PUT", "/v1/vaults/"+uuid, map[string]string{"display_name": name}, nil)
}

func (a *API) DeleteVault(uuid string) error {
	return a.json("DELETE", "/v1/vaults/"+uuid, nil, nil)
}

type Message struct {
	ID         int64  `json:"id"`
	FromDevice string `json:"from_device"`
	Kind       string `json:"kind"`
	Data       []byte `json:"data"`
}

func (a *API) PostMessage(to, kind string, data []byte) error {
	return a.json("POST", "/v1/messages", map[string]any{"to_device": to, "kind": kind, "data": data}, nil)
}

func (a *API) Messages() ([]Message, error) {
	var r struct{ Messages []Message }
	err := a.json("GET", "/v1/messages", nil, &r)
	return r.Messages, err
}

func (a *API) DeleteMessage(id int64) error {
	return a.json("DELETE", "/v1/messages/"+strconv.FormatInt(id, 10), nil, nil)
}

// Transport returns the vault.Transport for one vault on this server.
func (a *API) Transport(vaultUUID string) vault.Transport { return &httpTransport{a, vaultUUID} }

type httpTransport struct {
	a    *API
	uuid string
}

func (t *httpTransport) path(id string) string { return "/v1/vaults/" + t.uuid + "/objects/" + id }

func (t *httpTransport) Read(id string, max int) (*vault.Object, error) {
	resp, data, err := t.a.do("GET", t.path(id)+"?max_bytes="+strconv.Itoa(max), nil, nil)
	if errors.Is(err, ErrNotFound) {
		var ae *APIError
		// A missing vault is an error; a missing object is "absent".
		if errors.As(err, &ae) && ae.Code == "no_object" {
			return nil, nil
		}
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	rev := strings.Trim(resp.Header.Get("ETag"), `"`)
	if rev == "" || len(data) > max {
		return nil, vault.ErrInvalidData
	}
	return &vault.Object{Data: data, Revision: rev}, nil
}

func (t *httpTransport) Write(id string, expected *string, data []byte, epoch *uint32) (string, error) {
	hdr := http.Header{}
	hdr.Set("Content-Type", "application/octet-stream")
	if expected == nil {
		hdr.Set("If-None-Match", "*")
	} else {
		hdr.Set("If-Match", `"`+*expected+`"`)
	}
	if epoch != nil {
		hdr.Set("X-Retention-Epoch", strconv.FormatUint(uint64(*epoch), 10))
	}
	resp, _, err := t.a.do("PUT", t.path(id), hdr, data)
	if err != nil {
		return "", err
	}
	return strings.Trim(resp.Header.Get("ETag"), `"`), nil
}

func (t *httpTransport) CollectEpochsBefore(epoch uint32) error {
	return t.a.json("POST", "/v1/vaults/"+t.uuid+"/collect", map[string]uint32{"minimum_retained_epoch": epoch}, nil)
}
