package phase4

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	sc "corvid/syncclient"
	"corvid/syncserver/syncserver"
)

// Ops (4.7): stop-and-copy backup restores a working server with the same accounts and data.
func TestBackupRestoreByCopy(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("tess", "backup passphrase 1", "a")
	must(t, a.eng.SetSetting("keep", "me"))
	a.sync(t)

	e.ts.Close()
	e.srv.Close()
	restored := t.TempDir()
	for _, f := range []string{"sync.db", "keys.json"} {
		b, err := os.ReadFile(filepath.Join(e.dir, f))
		must(t, err)
		must(t, os.WriteFile(filepath.Join(restored, f), b, 0o600))
	}
	cfg := e.cfg
	cfg.DBPath, cfg.KeyFile = filepath.Join(restored, "sync.db"), filepath.Join(restored, "keys.json")
	srv, err := syncserver.New(cfg)
	must(t, err)
	defer srv.Close()
	ts := httptest.NewServer(srv)
	defer ts.Close()

	// existing user logs in on a new device with the same passphrase and gets the data after approval
	b, err := sc.Login(ctx(), ts.URL, "tess", "backup passphrase 1", "b", &sc.MemStateStore{}, nil)
	must(t, err)
	// device A keeps its keys and token; only the server's address changed
	st := *a.acct.St
	st.ServerURL = ts.URL
	store := &sc.MemStateStore{}
	raw, _ := json.Marshal(&st)
	must(t, store.Save(raw))
	a2, err := sc.OpenAccount(store, nil)
	must(t, err)
	devs, err := a2.Devices(ctx())
	if err != nil {
		t.Fatalf("session should survive a restore of the same DB: %v", err)
	}
	for _, d := range devs {
		if d.State == "pending" {
			must(t, a2.ApproveDevice(ctx(), d.ID, d.Fingerprint))
		}
	}
	must(t, b.Poll(ctx()))
	eb := e.newEngine(b)
	if _, err := eb.Sync(ctx()); err != nil {
		t.Fatal(err)
	}
	if v, ok := eb.Setting("keep"); !ok || string(v) != `"me"` {
		t.Fatalf("data missing after restore: %s", v)
	}
}

// An unknown schema version is refused instead of silently corrupted.
func TestRefusesUnknownSchema(t *testing.T) {
	e := newEnv(t, nil, nil)
	e.ts.Close()
	e.srv.Close()
	// bump the schema marker with the driver the server already uses
	db, err := openSQL(filepath.Join(e.dir, "sync.db"))
	must(t, err)
	_, err = db.Exec(`UPDATE meta SET v='99' WHERE k='schema'`)
	must(t, err)
	db.Close()
	if _, err := syncserver.New(e.cfg); err == nil {
		t.Fatal("server started on an unknown schema")
	}
}
