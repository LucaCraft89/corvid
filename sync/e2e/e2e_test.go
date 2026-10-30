// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// End-to-end tests: real HTTP server and SQLite, several simulated devices.
// By default the server runs in-process. With CORVID_SYNC_SERVER_BIN set to
// a built corvid-sync-server, each test starts that binary instead.
package e2e

import (
	"bufio"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/lucacraft89/corvid/sync/client"
	"github.com/lucacraft89/corvid/sync/client/vault"
	"github.com/lucacraft89/corvid/sync/server/httpapi"
	_ "modernc.org/sqlite"
)

type env struct {
	t      *testing.T
	url    string
	dbPath string
	token  func(account string) string
}

func start(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	e := &env{t: t, dbPath: filepath.Join(dir, "sync.db")}
	if bin := os.Getenv("CORVID_SYNC_SERVER_BIN"); bin != "" {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		addr := l.Addr().String()
		l.Close()
		cmd := exec.Command(bin, "serve", "--db", e.dbPath, "--listen", addr)
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { cmd.Process.Signal(os.Interrupt); cmd.Wait() })
		e.url = "http://" + addr
		for i := 0; ; i++ {
			if resp, err := http.Get(e.url + "/v1/health"); err == nil {
				resp.Body.Close()
				break
			}
			if i > 100 {
				t.Fatal("server binary did not come up")
			}
			time.Sleep(50 * time.Millisecond)
		}
		e.token = func(account string) string {
			out, err := exec.Command(bin, "token", "--db", e.dbPath, "--account", account).Output()
			if err != nil {
				t.Fatalf("token: %v", err)
			}
			line, _ := bufio.NewReader(strings.NewReader(string(out))).ReadString('\n')
			return strings.TrimSpace(line)
		}
		return e
	}
	db, err := httpapi.OpenDB(e.dbPath)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer((&httpapi.Server{DB: db, QuotaBytes: 64 << 20}).Handler())
	t.Cleanup(func() { srv.Close(); db.Close() })
	e.url = srv.URL
	e.token = func(account string) string {
		tok, _, err := db.CreateToken(account, time.Hour, "admin")
		if err != nil {
			t.Fatal(err)
		}
		return tok
	}
	return e
}

// rawDB opens the server's database directly, to play a malicious server.
func (e *env) rawDB() *sql.DB {
	d, err := sql.Open("sqlite", "file:"+e.dbPath+"?_pragma=busy_timeout(5000)")
	if err != nil {
		e.t.Fatal(err)
	}
	e.t.Cleanup(func() { d.Close() })
	return d
}

// netSwitch makes a device go offline: every request fails.
type netSwitch struct{ off atomic.Bool }

func (n *netSwitch) RoundTrip(r *http.Request) (*http.Response, error) {
	if n.off.Load() {
		return nil, errors.New("simulated network down")
	}
	return http.DefaultTransport.RoundTrip(r)
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// pair runs the full approval flow and checks both sides show the same code.
func pair(t *testing.T, e *env, approver *client.Device, name string, hc *http.Client) *client.Device {
	t.Helper()
	code, err := approver.Invite(10 * time.Minute)
	must(t, err)
	nd, err := client.JoinWithInvite(e.url, hc, code, name)
	must(t, err)
	shown, err := nd.ComparisonCode()
	must(t, err)
	pending, err := approver.PendingPairings()
	must(t, err)
	if len(pending) != 1 || pending[0].DeviceID != nd.ID {
		t.Fatalf("pending pairings: %+v", pending)
	}
	if pending[0].Code != shown {
		t.Fatalf("comparison codes differ: approver %s, new device %s", pending[0].Code, shown)
	}
	must(t, approver.Approve(nd.ID))
	must(t, nd.Sync())
	if nd.VaultUUID() != approver.VaultUUID() {
		t.Fatal("new device did not join the vault")
	}
	return nd
}

func TestTwoDevicesConvergeAfterOfflineEdits(t *testing.T) {
	e := start(t)
	netA, netB := &netSwitch{}, &netSwitch{}
	a, err := client.RegisterDevice(e.url, &http.Client{Transport: netA}, e.token("alice"), "laptop")
	must(t, err)
	rk, err := a.CreateVault("Alice")
	must(t, err)
	if !strings.HasPrefix(rk, "CVK1-") {
		t.Fatalf("recovery key %q", rk)
	}
	a.Replica.Set("bookmark/1", []byte("https://example.org"))
	a.Replica.Set("setting/theme", []byte("dark"))
	must(t, a.Sync())
	b := pair(t, e, a, "phone", &http.Client{Transport: netB})
	if got, _ := b.Replica.Get("bookmark/1"); string(got) != "https://example.org" {
		t.Fatalf("b did not get initial data: %q", got)
	}

	// Both go offline and edit, including the same key.
	netA.off.Store(true)
	netB.off.Store(true)
	a.Replica.Set("bookmark/2", []byte("A-only"))
	a.Replica.Set("setting/theme", []byte("light"))
	a.Replica.Delete("bookmark/1")
	for i := range 70 {
		b.Replica.Set(fmt.Sprintf("history/%02d", i), []byte("visit"))
	}
	b.Replica.Set("setting/theme", []byte("blue"))
	b.Replica.Set("bookmark/3", []byte("B-only"))
	if err := a.Sync(); err == nil {
		t.Fatal("sync succeeded while offline")
	}
	if err := b.Sync(); err == nil {
		t.Fatal("sync succeeded while offline")
	}
	if a.Replica.Pending() == 0 || b.Replica.Pending() == 0 {
		t.Fatal("offline edits were lost")
	}

	// Back online, in either order, a couple of rounds.
	netB.off.Store(false)
	must(t, b.Sync())
	netA.off.Store(false)
	must(t, a.Sync())
	must(t, b.Sync())
	sa, sb := a.Replica.Snapshot(), b.Replica.Snapshot()
	if !reflect.DeepEqual(sa, sb) {
		t.Fatalf("did not converge:\nA=%v\nB=%v", sa, sb)
	}
	if _, ok := sa["bookmark/1"]; ok {
		t.Error("delete was lost")
	}
	if sa["bookmark/2"] != "A-only" || sa["bookmark/3"] != "B-only" || len(sa) != 73 {
		t.Errorf("unexpected merged state (%d keys): %v", len(sa), sa)
	}
	// Same key edited on both: one deterministic winner on both sides.
	if sa["setting/theme"] != "light" && sa["setting/theme"] != "blue" {
		t.Errorf("theme = %q", sa["setting/theme"])
	}
	t.Logf("converged: %d keys, theme=%s", len(sa), sa["setting/theme"])

	// Many commits: the vault crossed an epoch and still loads from scratch.
	for i := range 80 {
		a.Replica.Set("counter", []byte(fmt.Sprint(i)))
		must(t, a.Sync())
	}
	c := pair(t, e, a, "tablet", nil)
	if !reflect.DeepEqual(c.Replica.Snapshot(), a.Replica.Snapshot()) {
		t.Fatal("third device differs after epoch rollover")
	}
	if len(a.Reports)+len(b.Reports)+len(c.Reports) != 0 {
		t.Fatalf("unexpected reports: %v %v %v", a.Reports, b.Reports, c.Reports)
	}
}

func TestTamperedDataIsRejectedAndReported(t *testing.T) {
	e := start(t)
	a, err := client.RegisterDevice(e.url, nil, e.token("alice"), "laptop")
	must(t, err)
	_, err = a.CreateVault("Alice")
	must(t, err)
	a.Replica.Set("k", []byte("v1"))
	must(t, a.Sync())
	b := pair(t, e, a, "phone", nil)
	a.Replica.Set("k", []byte("v2"))
	must(t, a.Sync())

	db := e.rawDB()
	var id string
	var data []byte
	must(t, db.QueryRow(`SELECT object_id, data FROM objects WHERE vault_uuid=? AND object_id NOT IN ('head','roster') ORDER BY updated DESC, rowid DESC LIMIT 1`, a.VaultUUID()).Scan(&id, &data))
	bad := append([]byte(nil), data...)
	bad[len(bad)/2] ^= 0x01
	_, err = db.Exec(`UPDATE objects SET data=? WHERE object_id=?`, bad, id)
	must(t, err)

	before := b.Replica.Snapshot()
	err = b.Sync()
	if !errors.Is(err, vault.ErrContentAddress) && !errors.Is(err, vault.ErrAuthentication) {
		t.Fatalf("tampered commit: got %v", err)
	}
	if !reflect.DeepEqual(before, b.Replica.Snapshot()) {
		t.Fatal("tampered data was applied")
	}
	if len(b.Reports) == 0 {
		t.Fatal("tampering was not reported")
	}
	t.Logf("reported: %s: %v", b.Reports[0].What, b.Reports[0].Err)
	_, err = db.Exec(`UPDATE objects SET data=? WHERE object_id=?`, data, id)
	must(t, err)

	// Tampered head: one flipped bit fails authentication.
	var head []byte
	must(t, db.QueryRow(`SELECT data FROM objects WHERE vault_uuid=? AND object_id='head'`, a.VaultUUID()).Scan(&head))
	badHead := append([]byte(nil), head...)
	badHead[5] ^= 0x80
	db.Exec(`UPDATE objects SET data=? WHERE vault_uuid=? AND object_id='head'`, badHead, a.VaultUUID())
	if err := b.Sync(); !errors.Is(err, vault.ErrAuthentication) {
		t.Fatalf("tampered head: got %v", err)
	}
	db.Exec(`UPDATE objects SET data=? WHERE vault_uuid=? AND object_id='head'`, head, a.VaultUUID())
	must(t, b.Sync())
	if v, _ := b.Replica.Get("k"); string(v) != "v2" {
		t.Fatalf("after repair: %q", v)
	}

	// Rollback: the server restores an older head that b already moved past.
	a.Replica.Set("k", []byte("v3"))
	must(t, a.Sync())
	must(t, b.Sync())
	db.Exec(`UPDATE objects SET data=? WHERE vault_uuid=? AND object_id='head'`, head, a.VaultUUID())
	if err := b.Sync(); !errors.Is(err, vault.ErrRollback) {
		t.Fatalf("rollback: got %v", err)
	}
	if v, _ := b.Replica.Get("k"); string(v) != "v3" {
		t.Fatalf("rollback was applied: %q", v)
	}

	// Tampered roster.
	var roster []byte
	must(t, db.QueryRow(`SELECT data FROM objects WHERE vault_uuid=? AND object_id='roster'`, a.VaultUUID()).Scan(&roster))
	roster[len(roster)-1] ^= 1
	db.Exec(`UPDATE objects SET data=? WHERE vault_uuid=? AND object_id='roster'`, roster, a.VaultUUID())
	if _, err := b.Roster(); !errors.Is(err, vault.ErrAuthentication) {
		t.Fatalf("tampered roster: got %v", err)
	}
	t.Logf("b reported %d integrity problems", len(b.Reports))
	if len(b.Reports) < 4 {
		t.Fatalf("expected 4 reports, got %v", b.Reports)
	}
}

func TestWrongKeysAreRejected(t *testing.T) {
	e := start(t)
	a, err := client.RegisterDevice(e.url, nil, e.token("alice"), "laptop")
	must(t, err)
	rk, err := a.CreateVault("Alice")
	must(t, err)
	a.Replica.Set("secret", []byte("x"))
	must(t, a.Sync())

	// A recovery key for some other vault.
	r, err := client.RegisterDevice(e.url, nil, e.token("alice"), "restored")
	must(t, err)
	other := client.EncodeRecoveryKey(vault.NewKey())
	if err := r.RecoverWithKey(other); !errors.Is(err, vault.ErrAuthentication) {
		t.Fatalf("wrong recovery key: got %v", err)
	}
	if len(r.Reports) != 1 {
		t.Fatalf("wrong key not reported: %v", r.Reports)
	}
	// A mistyped recovery key is caught by its checksum.
	typo := []byte(rk)
	if typo[7] == 'A' {
		typo[7] = 'B'
	} else {
		typo[7] = 'A'
	}
	if err := r.RecoverWithKey(string(typo)); !errors.Is(err, client.ErrRecoveryKey) {
		t.Fatalf("mistyped recovery key: got %v", err)
	}
	// The right one works and the device can read the data.
	must(t, r.RecoverWithKey(rk))
	must(t, r.Sync())
	if v, _ := r.Replica.Get("secret"); string(v) != "x" {
		t.Fatal("recovered device cannot read data")
	}

	// A vault key delivered with the wrong pairing secret is refused.
	code, err := a.Invite(time.Minute)
	must(t, err)
	parts := strings.Split(code, "~")
	forged := parts[0] + "~" + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" + "~" + parts[2]
	nd, err := client.JoinWithInvite(e.url, nil, forged, "intruder")
	must(t, err)
	pending, err := a.PendingPairings()
	must(t, err)
	if len(pending) != 0 {
		t.Fatal("a pair request without the pairing secret was accepted")
	}
	if len(a.Reports) == 0 {
		t.Fatal("bad pair request not reported")
	}
	if err := nd.Sync(); !errors.Is(err, client.ErrNoVault) {
		t.Fatalf("intruder: got %v", err)
	}
}

func TestComparisonCodeExposesKeySwap(t *testing.T) {
	secret := make([]byte, 32)
	approver, _ := client.NewIdentity()
	newDev, _ := client.NewIdentity()
	attacker, _ := client.NewIdentity()
	honest := client.ComparisonCode(secret, approver.Public(), newDev.Public())
	if client.ComparisonCode(secret, approver.Public(), attacker.Public()) == honest {
		t.Fatal("swapped key gives the same code")
	}
	if len(honest) != 6 {
		t.Fatalf("code %q", honest)
	}
}

func TestRevokedDeviceLosesAccess(t *testing.T) {
	e := start(t)
	a, err := client.RegisterDevice(e.url, nil, e.token("alice"), "laptop")
	must(t, err)
	_, err = a.CreateVault("Alice")
	must(t, err)
	a.Replica.Set("before", []byte("1"))
	must(t, a.Sync())
	b := pair(t, e, a, "stolen phone", nil)
	c := pair(t, e, a, "tablet", nil)
	c.Replica.Set("offline-on-c", []byte("kept")) // not yet synced
	oldUUID, oldKey := a.VaultUUID(), a.VaultKey()

	newRK, err := a.Revoke(b.ID)
	must(t, err)
	if a.VaultUUID() == oldUUID {
		t.Fatal("vault was not rotated")
	}
	if !strings.HasPrefix(newRK, "CVK1-") {
		t.Fatal("no new recovery key")
	}

	// The server refuses the revoked device.
	if err := b.Sync(); !errors.Is(err, client.ErrDeviceRevoked) {
		t.Fatalf("revoked device sync: got %v", err)
	}
	if _, err := b.API.Vaults(); !errors.Is(err, client.ErrDeviceRevoked) {
		t.Fatalf("revoked device list: got %v", err)
	}

	// The remaining device follows the rotation and keeps its offline edit.
	a.Replica.Set("after", []byte("2"))
	must(t, a.Sync())
	must(t, c.Sync())
	must(t, a.Sync())
	if c.VaultUUID() != a.VaultUUID() {
		t.Fatal("tablet did not follow the rotation")
	}
	if !reflect.DeepEqual(a.Replica.Snapshot(), c.Replica.Snapshot()) {
		t.Fatalf("after rotation:\nA=%v\nC=%v", a.Replica.Snapshot(), c.Replica.Snapshot())
	}
	if v, _ := a.Replica.Get("offline-on-c"); string(v) != "kept" {
		t.Fatal("c's offline edit was lost in the rotation")
	}
	roster, err := a.Roster()
	must(t, err)
	if roster.Find(b.ID) != nil {
		t.Fatal("revoked device is in the new roster")
	}

	// Even with the ciphertext (say the server leaks it), the old key cannot
	// read the new vault.
	stolen, err := vault.NewStore(a.API.Transport(a.VaultUUID()), oldKey, a.VaultUUID(), client.KVCodec{}, vault.Checkpoint{}, nil)
	must(t, err)
	if _, err := stolen.Read(nil); !errors.Is(err, vault.ErrAuthentication) {
		t.Fatalf("old key on new vault: got %v", err)
	}
	// The old vault is gone from the server.
	if vs, _ := a.API.Vaults(); len(vs) != 1 || vs[0].UUID != a.VaultUUID() {
		t.Fatalf("vaults after rotation: %+v", vs)
	}
	if len(a.Reports)+len(c.Reports) != 0 {
		t.Fatalf("unexpected reports: %v %v", a.Reports, c.Reports)
	}
}
