package phase4

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	sc "corvid/syncclient"

	_ "modernc.org/sqlite"
)

// Acceptance 2: a dump of the server database (raw files AND a logical SQL dump)
// contains no URLs, titles, passwords, credential IDs, setting names/values,
// layout or module names.
func TestAcceptance2_DatabaseDumpHasNoPlaintext(t *testing.T) {
	e := newEnv(t, nil, nil)
	const pass = "zebra-quartz-passphrase-9981"
	a, rk := e.register("frank", pass, "dev-one")
	b := e.enroll(a, "frank", pass, "dev-two")

	secrets := []string{
		"https://secret-bank.example/login", "secret-bank.example", "My Private Bookmark Title",
		"Hunter2-Super-Secret-Pw", "pw-user-name-xyz", "CRED-ID-9f8e7d6c5b4a-passkey",
		"passkey-private-key-material-ABC", "rp.secret-site.example", "setting.private.name.zzz",
		"setting-private-value-qqq", "LayoutNamePrivate", "module-private-id-www", "Folder Private Name",
		pass, rk.String(),
	}
	must(t, a.eng.PutBookmark("bm1", sc.Bookmark{Kind: "folder", Title: "Folder Private Name", Parent: sc.BMToolbar, Index: "a"}))
	must(t, a.eng.PutBookmark("bm2", sc.Bookmark{Kind: "url", Title: "My Private Bookmark Title", URL: "https://secret-bank.example/login", Parent: "bm1", Index: "a"}))
	must(t, a.eng.Put(sc.Passwords, "pw1", sc.PasswordItem{Origin: "https://secret-bank.example", Username: "pw-user-name-xyz", Password: "Hunter2-Super-Secret-Pw"}))
	must(t, a.eng.Put(sc.Passkeys, "pk1", sc.PasskeyItem{CredentialID: "CRED-ID-9f8e7d6c5b4a-passkey", RPID: "rp.secret-site.example", PrivateKey: "passkey-private-key-material-ABC"}))
	must(t, a.eng.SetSetting("setting.private.name.zzz", "setting-private-value-qqq"))
	must(t, a.eng.PutLayout(sc.Layout{Name: "LayoutNamePrivate", Slots: []sc.LayoutSlot{{Slot: "sidebar", Module: "module-private-id-www"}}}))
	must(t, a.eng.PutModule(sc.ModuleEntry{ID: "module-private-id-www", Version: "1.0", Enabled: true}))
	a.sync(t)
	b.sync(t)
	// edit + delete so tombstones and overwritten rows are exercised too
	must(t, b.eng.PutBookmark("bm2", sc.Bookmark{Kind: "url", Title: "My Private Bookmark Title", URL: "https://secret-bank.example/login", Parent: "bm1", Index: "b"}))
	must(t, b.eng.Delete(sc.Passwords, "pw1"))
	b.sync(t)
	a.sync(t)
	must(t, a.acct.ChangePassphrase(ctx(), pass, pass+"-changed"))

	// positive control: the scanner must find things that ARE plaintext metadata
	controls := []string{"frank", "dev-one"}

	e.ts.Close()
	e.srv.Close() // checkpoints the WAL into the main file
	files := readAll(t, e.dir)
	if len(files["sync.db"]) == 0 {
		t.Fatal("no database file found")
	}
	var total int
	for name, b := range files {
		total += len(b)
		for _, s := range secrets {
			if bytes.Contains(b, []byte(s)) || bytes.Contains(bytes.ToLower(b), bytes.ToLower([]byte(s))) {
				t.Errorf("PLAINTEXT LEAK: %q found in %s", s, name)
			}
		}
	}
	for _, c := range controls {
		found := false
		for name, b := range files {
			if name == "sync.db" && bytes.Contains(b, []byte(c)) {
				found = true
			}
		}
		if !found {
			t.Errorf("scanner positive control %q not found in sync.db: scan is not trustworthy", c)
		}
	}

	// logical dump through SQL as well
	db, err := sql.Open("sqlite", "file:"+filepath.Join(e.dir, "sync.db")+"?mode=ro")
	if err != nil {
		t.Skipf("sqlite driver not linked into test binary: %v", err)
	}
	defer db.Close()
	var dump strings.Builder
	for _, q := range []string{"SELECT * FROM accounts", "SELECT * FROM devices", "SELECT * FROM records", "SELECT * FROM sessions"} {
		rows, err := db.Query(q)
		if err != nil {
			t.Fatal(err)
		}
		cols, _ := rows.Columns()
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			_ = rows.Scan(ptrs...)
			for _, v := range vals {
				switch x := v.(type) {
				case []byte:
					dump.Write(x)
				case string:
					dump.WriteString(x)
				}
				dump.WriteByte('|')
			}
			dump.WriteByte('\n')
		}
		rows.Close()
	}
	for _, s := range secrets {
		if strings.Contains(dump.String(), s) {
			t.Errorf("PLAINTEXT LEAK in SQL dump: %q", s)
		}
	}
	t.Logf("scanned %d bytes across %d files + %d-byte SQL dump: %d secrets absent; %d positive controls present", total, len(files), dump.Len(), len(secrets), len(controls))
	_ = os.Stdout
}
