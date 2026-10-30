// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type tc struct {
	t   *testing.T
	srv *httptest.Server
	db  *DB
}

func newTC(t *testing.T, quota int64) *tc {
	db, err := OpenDB(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer((&Server{DB: db, QuotaBytes: quota}).Handler())
	t.Cleanup(func() { srv.Close(); db.Close() })
	return &tc{t, srv, db}
}

func (c *tc) req(method, path, secret string, hdr map[string]string, body []byte) (*http.Response, []byte) {
	r, _ := http.NewRequest(method, c.srv.URL+path, bytes.NewReader(body))
	if secret != "" {
		r.Header.Set("Authorization", "Bearer "+secret)
	}
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp, b
}

func (c *tc) register(account string) string {
	tok, _, err := c.db.CreateToken(account, time.Hour, "admin")
	if err != nil {
		c.t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"token": tok, "name": "dev", "public_key": make([]byte, 32)})
	resp, b := c.req("POST", "/v1/register", "", nil, body)
	if resp.StatusCode != 201 {
		c.t.Fatalf("register: %d %s", resp.StatusCode, b)
	}
	var r struct {
		DeviceSecret string `json:"device_secret"`
	}
	json.Unmarshal(b, &r)
	return r.DeviceSecret
}

const vu = "0f8e7a3c-2b1d-4c5e-9f60-718293a4b5c6"

func digestID(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

func TestObjectRules(t *testing.T) {
	c := newTC(t, 1<<20)
	s := c.register("alice")
	obj := "/v1/vaults/" + vu + "/objects/"
	if resp, _ := c.req("GET", obj+"head", s, nil, nil); resp.StatusCode != 404 {
		t.Fatalf("missing vault: %d", resp.StatusCode)
	}
	if resp, _ := c.req("PUT", "/v1/vaults/"+vu, s, nil, []byte(`{"display_name":"v"}`)); resp.StatusCode != 201 {
		t.Fatalf("create vault: %d", resp.StatusCode)
	}
	if resp, _ := c.req("PUT", "/v1/vaults/"+vu, s, nil, []byte(`{"display_name":"v2"}`)); resp.StatusCode != 200 {
		t.Fatalf("idempotent create/rename: %d", resp.StatusCode)
	}
	if resp, b := c.req("GET", obj+"head", s, nil, nil); resp.StatusCode != 404 || !strings.Contains(string(b), "no_object") {
		t.Fatalf("absent object: %d %s", resp.StatusCode, b)
	}
	// Mutable head: conditional writes only.
	if resp, _ := c.req("PUT", obj+"head", s, nil, []byte("x")); resp.StatusCode != 428 {
		t.Fatalf("unconditional write: %d", resp.StatusCode)
	}
	resp, _ := c.req("PUT", obj+"head", s, map[string]string{"If-None-Match": "*"}, []byte("h1"))
	rev1 := resp.Header.Get("ETag")
	if resp.StatusCode != 201 || rev1 == "" {
		t.Fatalf("create head: %d", resp.StatusCode)
	}
	if resp, _ := c.req("PUT", obj+"head", s, map[string]string{"If-None-Match": "*"}, []byte("h2")); resp.StatusCode != 412 {
		t.Fatalf("create existing: %d", resp.StatusCode)
	}
	resp, _ = c.req("PUT", obj+"head", s, map[string]string{"If-Match": rev1}, []byte("h2"))
	if resp.StatusCode != 201 {
		t.Fatalf("CAS: %d", resp.StatusCode)
	}
	if resp, _ := c.req("PUT", obj+"head", s, map[string]string{"If-Match": rev1}, []byte("h3")); resp.StatusCode != 412 {
		t.Fatalf("stale CAS: %d", resp.StatusCode)
	}
	resp, b := c.req("GET", obj+"head", s, nil, nil)
	if string(b) != "h2" || resp.Header.Get("ETag") == rev1 {
		t.Fatalf("read back %q", b)
	}
	if resp, _ := c.req("GET", obj+"head?max_bytes=1", s, nil, nil); resp.StatusCode != 413 {
		t.Fatalf("max_bytes: %d", resp.StatusCode)
	}
	// Content-addressed objects: name must be the SHA-256, create-only.
	data := []byte("ciphertext")
	ep := map[string]string{"If-None-Match": "*", "X-Retention-Epoch": "0"}
	if resp, _ := c.req("PUT", obj+digestID([]byte("other")), s, ep, data); resp.StatusCode != 400 {
		t.Fatalf("wrong digest: %d", resp.StatusCode)
	}
	if resp, _ := c.req("PUT", obj+digestID(data), s, ep, data); resp.StatusCode != 201 {
		t.Fatalf("immutable create: %d", resp.StatusCode)
	}
	if resp, _ := c.req("PUT", obj+digestID(data), s, ep, data); resp.StatusCode != 412 {
		t.Fatalf("immutable rewrite: %d", resp.StatusCode)
	}
	if resp, _ := c.req("PUT", obj+"notes", s, map[string]string{"If-None-Match": "*"}, data); resp.StatusCode != 400 {
		t.Fatalf("unknown name: %d", resp.StatusCode)
	}
	// Collection removes only older epochs, never the head.
	d2 := []byte("epoch2")
	c.req("PUT", obj+digestID(d2), s, map[string]string{"If-None-Match": "*", "X-Retention-Epoch": "2"}, d2)
	resp, b = c.req("POST", "/v1/vaults/"+vu+"/collect", s, nil, []byte(`{"minimum_retained_epoch":1}`))
	if resp.StatusCode != 200 || !strings.Contains(string(b), `"deleted":1`) {
		t.Fatalf("collect: %d %s", resp.StatusCode, b)
	}
	if resp, _ := c.req("GET", obj+"head", s, nil, nil); resp.StatusCode != 200 {
		t.Fatal("collect removed the head")
	}
	if resp, _ := c.req("GET", obj+digestID(d2), s, nil, nil); resp.StatusCode != 200 {
		t.Fatal("collect removed a retained epoch")
	}
	// Another account cannot see this vault.
	s2 := c.register("bob")
	if resp, _ := c.req("GET", obj+"head", s2, nil, nil); resp.StatusCode != 404 {
		t.Fatalf("cross-account read: %d", resp.StatusCode)
	}
	// Quota.
	big := bytes.Repeat([]byte{1}, 1<<20)
	if resp, _ := c.req("PUT", obj+digestID(big), s, map[string]string{"If-None-Match": "*", "X-Retention-Epoch": "2"}, big); resp.StatusCode != 507 {
		t.Fatalf("quota: %d", resp.StatusCode)
	}
}

func TestTokensAndRevocation(t *testing.T) {
	c := newTC(t, 1<<20)
	tok, _, _ := c.db.CreateToken("alice", time.Hour, "admin")
	reg := func(token string) int {
		body, _ := json.Marshal(map[string]any{"token": token, "name": "d", "public_key": make([]byte, 32)})
		resp, _ := c.req("POST", "/v1/register", "", nil, body)
		return resp.StatusCode
	}
	if code := reg(tok); code != 201 {
		t.Fatalf("first use: %d", code)
	}
	if code := reg(tok); code != 403 {
		t.Fatalf("token reuse: %d", code)
	}
	expired, _, _ := c.db.CreateToken("alice", -time.Second, "admin")
	if code := reg(expired); code != 403 {
		t.Fatalf("expired token: %d", code)
	}
	if code := reg("reg_made_up"); code != 403 {
		t.Fatalf("unknown token: %d", code)
	}
	a, b := c.register("alice"), c.register("alice")
	if resp, _ := c.req("GET", "/v1/devices", "nope", nil, nil); resp.StatusCode != 401 {
		t.Fatalf("bad secret: %d", resp.StatusCode)
	}
	resp, body := c.req("GET", "/v1/me", b, nil, nil)
	var me struct {
		DeviceID string `json:"device_id"`
	}
	json.Unmarshal(body, &me)
	if resp, _ := c.req("DELETE", "/v1/devices/"+me.DeviceID, a, nil, nil); resp.StatusCode != 204 {
		t.Fatalf("revoke: %d", resp.StatusCode)
	}
	resp, body = c.req("GET", "/v1/vaults", b, nil, nil)
	if resp.StatusCode != 401 || !strings.Contains(string(body), "device_revoked") {
		t.Fatalf("revoked device: %d %s", resp.StatusCode, body)
	}
	// An invite from a device works once, for the same account.
	resp, body = c.req("POST", "/v1/invites", a, nil, []byte(`{"ttl_seconds":60}`))
	var inv struct{ Token string }
	json.Unmarshal(body, &inv)
	if resp.StatusCode != 201 || reg(inv.Token) != 201 || reg(inv.Token) != 403 {
		t.Fatal("invite token")
	}
	// Devices of another account cannot be revoked.
	s2 := c.register("bob")
	resp, body = c.req("GET", "/v1/me", a, nil, nil)
	json.Unmarshal(body, &me)
	if resp, _ := c.req("DELETE", "/v1/devices/"+me.DeviceID, s2, nil, nil); resp.StatusCode != 404 {
		t.Fatalf("cross-account revoke: %d", resp.StatusCode)
	}
}
