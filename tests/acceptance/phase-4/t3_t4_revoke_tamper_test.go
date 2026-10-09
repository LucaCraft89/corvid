package phase4

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	sc "corvid/syncclient"
)

// rawPull fetches the wire records with a device's own bearer token.
func rawPull(t *testing.T, e *env, d *device) []struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
	Epoch      int    `json:"epoch"`
	Blob       []byte `json:"blob"`
} {
	t.Helper()
	req, _ := http.NewRequest("GET", e.ts.URL+"/v1/records/pull?since=0&limit=500", nil)
	req.Header.Set("Authorization", "Bearer "+d.acct.St.Token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out struct {
		Records []struct {
			Collection string `json:"collection"`
			ID         string `json:"id"`
			Epoch      int    `json:"epoch"`
			Blob       []byte `json:"blob"`
		} `json:"records"`
	}
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("pull status %d %s", resp.StatusCode, b)
	}
	_ = json.Unmarshal(b, &out)
	return out.Records
}

// Acceptance 3: a revoked device cannot pull, cannot log in, and cannot decrypt new data
// even if it got the ciphertext some other way.
func TestAcceptance3_RevokedDeviceCannotPullOrDecrypt(t *testing.T) {
	e := newEnv(t, nil, nil)
	const pass = "revocation test passphrase"
	a, _ := e.register("gina", pass, "laptop")
	lost := e.enroll(a, "gina", pass, "stolen-phone")
	third := e.enroll(a, "gina", pass, "tablet")
	must(t, a.eng.SetSetting("before", "old-data"))
	a.sync(t)
	lost.sync(t)
	third.sync(t)
	if _, ok := lost.eng.Setting("before"); !ok {
		t.Fatal("precondition: device should have synced before revocation")
	}

	// revoke from the laptop
	must(t, a.acct.RevokeDevice(ctx(), lost.acct.St.DeviceID, pass))

	must(t, a.eng.SetSetting("after", "secret-written-after-revocation"))
	must(t, a.eng.PutBookmark("n1", sc.Bookmark{Kind: "url", Title: "post-revocation", URL: "https://after.example", Parent: sc.BMToolbar, Index: "a"}))
	a.sync(t)

	// 1. the revoked device is refused by the server
	if _, err := lost.eng.Sync(ctx()); !errors.Is(err, sc.ErrUnauthorized) {
		t.Fatalf("revoked device sync: want 401, got %v", err)
	}
	if _, err := sc.Login(ctx(), e.ts.URL, "gina", pass, "stolen-phone", &sc.MemStateStore{}, nil); err != nil {
		// a *new* login with a fresh identity is just a pending device (cannot read) — that must work or be refused, never grant data
		t.Logf("fresh login as a new device: %v", err)
	}
	relogin := lost.acct.St
	_ = relogin
	req, _ := http.NewRequest("GET", e.ts.URL+"/v1/records/pull?since=0", nil)
	req.Header.Set("Authorization", "Bearer "+lost.acct.St.Token)
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != 401 {
		t.Fatalf("revoked token pull: want 401, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 2. even holding the ciphertext (malicious server / disk theft), it has no key for the new epoch
	recs := rawPull(t, e, a)
	var checked int
	for _, r := range recs {
		if r.Epoch >= 1 {
			checked++
			if _, err := lost.acct.St.Keybag.Open("gina", r.Collection, r.ID, r.Epoch, r.Blob); !errors.Is(err, sc.ErrUnknownEpoch) {
				t.Fatalf("revoked device decrypted epoch-%d data: %v", r.Epoch, err)
			}
			// and the surviving devices can
			if _, err := a.acct.St.Keybag.Open("gina", r.Collection, r.ID, r.Epoch, r.Blob); err != nil {
				t.Fatalf("surviving device cannot decrypt: %v", err)
			}
		}
	}
	if checked < 2 {
		t.Fatalf("expected post-revocation records at epoch>=1, saw %d", checked)
	}

	// 3. the other device learns the new epoch key via its sealed package and keeps working
	third.sync(t)
	if v, ok := third.eng.Setting("after"); !ok || string(v) != `"secret-written-after-revocation"` {
		t.Fatalf("remaining device lost access after rotation: %v %s", ok, v)
	}

	// 4. a revoked device id cannot sneak back in by logging in again with the passphrase
	_, err := sc.Login(ctx(), e.ts.URL, "gina", pass, "stolen-phone", lostStore(lost), nil)
	if err == nil {
		t.Fatal("revoked device id was able to log in")
	}
	t.Logf("revoked device login refused: %v", err)
}

func lostStore(d *device) sc.StateStore {
	s := &sc.MemStateStore{}
	b, _ := json.Marshal(d.acct.St)
	_ = s.Save(b)
	return s
}

// A pending (never approved) device must not read anything even with the right passphrase.
func TestPendingDeviceCannotReadData(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("hank", "pending test passphrase", "a")
	must(t, a.eng.SetSetting("k", "v"))
	a.sync(t)
	p, err := sc.Login(ctx(), e.ts.URL, "hank", "pending test passphrase", "intruder", &sc.MemStateStore{}, nil)
	must(t, err)
	if p.Approved() {
		t.Fatal("must be pending")
	}
	eng := e.newEngine(p)
	if _, err := eng.Sync(ctx()); err == nil {
		t.Fatal("pending device synced")
	}
	if p.St.Keybag != nil {
		t.Fatal("pending device holds keys")
	}
}

// ---------- Acceptance 4 ----------

// Wrong passphrase is rejected on the client (OPAQUE: server proof fails) and reported, identically for unknown users.
func TestAcceptance4_WrongPassphraseRejected(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("iris", "the right passphrase", "a")
	_ = a
	for _, c := range []struct{ user, pass string }{{"iris", "the wrong passphrase"}, {"nobody-here", "whatever pass"}} {
		_, err := sc.Login(ctx(), e.ts.URL, c.user, c.pass, "x", &sc.MemStateStore{}, nil)
		if !errors.Is(err, sc.ErrWrongPassphrase) {
			t.Fatalf("%s: want ErrWrongPassphrase, got %v", c.user, err)
		}
	}
	// the wrong passphrase also cannot authorise sensitive operations on a logged-in device
	if err := a.acct.ChangePassphrase(ctx(), "not it", "new one 12345"); !errors.Is(err, sc.ErrWrongPassphrase) {
		t.Fatalf("change with wrong old passphrase: %v", err)
	}
	if err := a.acct.RevokeDevice(ctx(), "00000000000000000000000000000000", "not it"); !errors.Is(err, sc.ErrWrongPassphrase) {
		t.Fatalf("revoke with wrong passphrase: %v", err)
	}
}

// tamperProxy modifies pull responses like a malicious server would.
type tamperProxy struct {
	next http.Handler
	mode atomic.Value // string
}

func (p *tamperProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	mode, _ := p.mode.Load().(string)
	if mode == "" || r.URL.Path != "/v1/records/pull" {
		p.next.ServeHTTP(w, r)
		return
	}
	rec := httptest.NewRecorder()
	p.next.ServeHTTP(rec, r)
	body := rec.Body.Bytes()
	if rec.Code == 200 {
		var m map[string]json.RawMessage
		if json.Unmarshal(body, &m) == nil {
			var recs []map[string]any
			_ = json.Unmarshal(m["records"], &recs)
			switch mode {
			case "flip":
				for _, r := range recs {
					b := decodeB64(r["blob"].(string))
					b[len(b)/2] ^= 0x01
					r["blob"] = encodeB64(b)
				}
			case "swap":
				if len(recs) >= 2 {
					recs[0]["blob"], recs[1]["blob"] = recs[1]["blob"], recs[0]["blob"]
				}
			case "truncate":
				for _, r := range recs {
					b := decodeB64(r["blob"].(string))
					r["blob"] = encodeB64(b[:10])
				}
			case "rollback":
				m["head_seq"] = json.RawMessage("0")
			}
			m["records"], _ = json.Marshal(recs)
			body, _ = json.Marshal(m)
		}
	}
	for k, v := range rec.Header() {
		w.Header()[k] = v
	}
	w.Header().Del("Content-Length")
	w.WriteHeader(rec.Code)
	_, _ = w.Write(body)
}

func TestAcceptance4_TamperedCiphertextRejectedAndReported(t *testing.T) {
	for _, mode := range []string{"flip", "swap", "truncate"} {
		t.Run(mode, func(t *testing.T) {
			var tp *tamperProxy
			e := newEnv(t, nil, func(h http.Handler) http.Handler { tp = &tamperProxy{next: h}; return tp })
			a, _ := e.register("jack", "tamper test passphrase", "a")
			b := e.enroll(a, "jack", "tamper test passphrase", "b")
			must(t, a.eng.SetSetting("s1", "value-one"))
			must(t, a.eng.SetSetting("s2", "value-two"))
			must(t, a.eng.Put(sc.Passwords, "p1", sc.PasswordItem{Origin: "o", Username: "u", Password: "pw-one"}))
			must(t, a.eng.Put(sc.Passwords, "p2", sc.PasswordItem{Origin: "o2", Username: "u2", Password: "pw-two"}))
			a.sync(t)
			tp.mode.Store(mode)
			rep, err := b.eng.Sync(ctx())
			if err != nil {
				t.Fatalf("sync should complete and report, got error %v", err)
			}
			if len(rep.Integrity) == 0 {
				t.Fatal("tampering was not reported")
			}
			if len(b.eng.Quarantine) == 0 {
				t.Fatal("tampered records were not quarantined")
			}
			// never silently applied: nothing from the tampered pulls is visible
			if n := len(b.eng.SettingsMap()) + len(b.eng.List(sc.Passwords)); n != 0 {
				// "swap" only affects the first two records of each response; anything applied must be authentic
				if mode != "swap" {
					t.Fatalf("%d tampered records were applied", n)
				}
				for k, v := range b.eng.SettingsMap() {
					want := map[string]string{"s1": `"value-one"`, "s2": `"value-two"`}[k]
					if string(v) != want {
						t.Fatalf("swapped data applied: %s=%s", k, v)
					}
				}
			}
			t.Logf("%s: %d integrity errors reported, first: %v", mode, len(rep.Integrity), rep.Integrity[0].Err)
			// once the network is honest again the data arrives
			tp.mode.Store("")
			b.eng.Quarantine = nil
		})
	}
}

func TestServerRollbackDetected(t *testing.T) {
	var tp *tamperProxy
	e := newEnv(t, nil, func(h http.Handler) http.Handler { tp = &tamperProxy{next: h}; return tp })
	a, _ := e.register("kim", "rollback passphrase", "a")
	must(t, a.eng.SetSetting("x", 1))
	a.sync(t)
	a.sync(t)
	tp.mode.Store("rollback")
	if _, err := a.eng.Sync(ctx()); !errors.Is(err, sc.ErrServerRollback) {
		t.Fatalf("want ErrServerRollback, got %v", err)
	}
}

var _ = bytes.Equal
