package phase4

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	sc "corvid/syncclient"
	"corvid/syncserver/syncserver"
)

// Strict model: a passphrase holder who ALSO controls the server cannot add a device that reads data.
func TestStrict_PassphraseHolderControllingServerCannotAddDevice(t *testing.T) {
	e := newEnv(t, nil, nil)
	const pass = "strict mode passphrase 1"
	a, _ := e.register("uma", pass, "trusted")
	must(t, a.eng.Put(sc.Passwords, "p", sc.PasswordItem{Origin: "o", Username: "u", Password: "TOP-SECRET-PW"}))
	a.sync(t)

	// no passphrase-wrapped key copy exists anywhere
	req, _ := http.NewRequest("GET", e.ts.URL+"/v1/keys", nil)
	req.Header.Set("Authorization", "Bearer "+a.acct.St.Token)
	resp, _ := http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if bytes.Contains(body, []byte("wrap_pass")) {
		t.Fatalf("/v1/keys still exposes a passphrase wrap: %s", body)
	}
	db, err := openSQL(filepath.Join(e.dir, "sync.db"))
	must(t, err)
	defer db.Close()
	rows, _ := db.Query(`SELECT name FROM pragma_table_info('accounts')`)
	for rows.Next() {
		var n string
		_ = rows.Scan(&n)
		if strings.Contains(n, "wrap") {
			t.Fatalf("accounts table has column %q", n)
		}
	}
	rows.Close()

	// attacker: knows the passphrase, and rewrites the server database at will
	att, err := sc.Login(ctx(), e.ts.URL, "uma", pass, "attacker", &sc.MemStateStore{}, nil)
	must(t, err)
	if att.Approved() {
		t.Fatal("new device must start pending")
	}
	if _, err := db.Exec(`UPDATE devices SET state='approved' WHERE name='attacker'`); err != nil {
		t.Fatal(err)
	}
	// 1. forced "approved" with no key package: no keys
	must(t, att.Poll(ctx()))
	if att.Approved() || att.St.Keybag != nil {
		t.Fatal("server alone approved a device")
	}
	if _, err := e.newEngine(att).Sync(ctx()); err == nil {
		t.Fatal("unapproved device synced")
	}
	// 2. garbage key package
	if _, err := db.Exec(`UPDATE devices SET pkg=? WHERE name='attacker'`, []byte("not a sealed box")); err != nil {
		t.Fatal(err)
	}
	if err := att.Poll(ctx()); err == nil || att.St.Keybag != nil {
		t.Fatalf("garbage package accepted: %v", err)
	}
	// 3. a package sealed to the attacker containing an attacker-made keybag: opens, but decrypts nothing
	pkg, err := sc.SealKeybag(att.St.DevPub, sc.NewKeybag())
	must(t, err)
	if _, err := db.Exec(`UPDATE devices SET pkg=? WHERE name='attacker'`, pkg); err != nil {
		t.Fatal(err)
	}
	must(t, att.Poll(ctx()))
	ae := e.newEngine(att)
	rep, err := ae.Sync(ctx())
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Integrity) == 0 || len(ae.List(sc.Passwords)) != 0 {
		t.Fatalf("attacker with forged keys read data: integrity=%d passwords=%d", len(rep.Integrity), len(ae.List(sc.Passwords)))
	}
	// the real approval path still works and the comparison code matches on both sides
	good := e.enroll(a, "uma", pass, "legit")
	devs, _ := a.acct.Devices(ctx())
	var seen bool
	for _, d := range devs {
		if d.Name == "legit" && d.Fingerprint == good.acct.ApprovalCode() {
			seen = true
		}
	}
	if !seen {
		t.Fatal("approval codes shown on the two devices differ")
	}
	good.sync(t)
	if _, ok := good.eng.Get(sc.Passwords, "p"); !ok {
		t.Fatal("legit device lost data")
	}
}

// Cookies NEVER sync; the sync set is exactly the agreed one.
func TestCookiesCannotBeRegistered(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("vic", "cookie test passphrase", "a")
	if err := a.eng.Put("cookies", "c1", map[string]string{"v": "x"}); err != sc.ErrBadCollection {
		t.Fatalf("client accepted cookies: %v", err)
	}
	if err := a.eng.Delete("cookies", "c1"); err != sc.ErrBadCollection {
		t.Fatalf("client accepted cookie delete: %v", err)
	}
	for _, c := range sc.AllCollections {
		if strings.Contains(strings.ToLower(c), "cookie") {
			t.Fatalf("cookie-like collection %q registered", c)
		}
	}
	if sc.ValidCollection("cookies") || sc.ValidCollection("Cookies") || sc.ValidCollection("cookie") {
		t.Fatal("ValidCollection accepts cookies")
	}
	// server side too
	raw := `{"records":[{"collection":"cookies","id":"` + strings.Repeat("a", 64) + `","epoch":0,"blob":"AAAA"}]}`
	req, _ := http.NewRequest("POST", e.ts.URL+"/v1/records/push", strings.NewReader(raw))
	req.Header.Set("Authorization", "Bearer "+a.acct.St.Token)
	resp, err := http.DefaultClient.Do(req)
	must(t, err)
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(b), `"rejected"`) || !strings.Contains(string(b), `"collection"`) {
		t.Fatalf("server accepted a cookies record: %s", b)
	}
	req, _ = http.NewRequest("GET", e.ts.URL+"/v1/records/pull?collection=cookies", nil)
	req.Header.Set("Authorization", "Bearer "+a.acct.St.Token)
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Fatalf("pull of cookies collection: %d", resp.StatusCode)
	}
	want := map[string]bool{"bookmarks": true, "passwords": true, "passkeys": true, "settings": true, "layouts": true, "modules": true, "extensions": true, "themes": true, "history": true, "tabs": true}
	for _, c := range sc.AllCollections {
		delete(want, c)
	}
	if len(want) != 0 {
		t.Fatalf("missing collections: %v", want)
	}
}

func TestExtensionsThemesHistorySyncAndTabsOffByDefault(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("wes", "sync set passphrase 1", "a")
	b := e.enroll(a, "wes", "sync set passphrase 1", "b")
	if !a.eng.Enabled(sc.History) || a.eng.Enabled(sc.Tabs) {
		t.Fatal("history must default on, open tabs off")
	}
	must(t, a.eng.PutExtension(sc.ExtensionEntry{ID: "ublock-origin", Version: "1.60", Source: "default", Enabled: true, Settings: json.RawMessage(`{"lists":["easylist"]}`)}))
	must(t, a.eng.PutTheme(sc.ThemeEntry{Name: "dusk", Seed: "#445566", Scheme: "dark"}))
	must(t, a.eng.Put(sc.Tabs, "t1", map[string]string{"url": "https://tab.example"}))
	// concurrent visits to the same URL on two devices must union, not overwrite
	must(t, a.eng.RecordVisit("h1", "https://h.example", "H", 1000))
	must(t, b.eng.RecordVisit("h1", "https://h.example", "H", 2000))
	a.sync(t)
	b.sync(t)
	a.sync(t)
	b.sync(t)
	if len(b.eng.ExtensionList()) != 1 || b.eng.ExtensionList()[0].ID != "ublock-origin" {
		t.Fatal("extension list not synced")
	}
	if _, ok := b.eng.Get(sc.Themes, "dusk"); !ok {
		t.Fatal("theme not synced")
	}
	if _, ok := b.eng.Get(sc.Tabs, "t1"); ok {
		t.Fatal("open tabs synced although off by default")
	}
	for _, d := range []*device{a, b} {
		r, ok := d.eng.Get(sc.History, "h1")
		var h sc.HistoryItem
		_ = json.Unmarshal(r.Data, &h)
		if !ok || len(h.Visits) != 2 {
			t.Fatalf("%s: history visits not unioned: %+v", d.name, h)
		}
	}
	must(t, a.eng.SetEnabled(sc.History, false))
	must(t, a.eng.RecordVisit("h2", "https://off.example", "x", 5))
	a.sync(t)
	b.sync(t)
	if _, ok := b.eng.Get(sc.History, "h2"); ok {
		t.Fatal("history uploaded while its toggle is off")
	}
}

// ---------- admin UI ----------

func adminCall(t *testing.T, e *env, method, path, tok string, body any) (int, []byte) {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, e.ts.URL+path, rd)
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	must(t, err)
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

func TestAdminUIOffByDefault(t *testing.T) {
	e := newEnv(t, nil, nil)
	for _, p := range []string{"/admin", "/admin/app.js", "/admin/api/health", "/admin/api/users"} {
		if c, _ := adminCall(t, e, "GET", p, "anything", nil); c != 404 {
			t.Fatalf("%s reachable with admin disabled: %d", p, c)
		}
	}
}

func TestAdminUI(t *testing.T) {
	const adm = "admin-token-for-tests-0123456789"
	e := newEnv(t, func(c *syncserver.Config) { c.AdminToken = adm; c.RegToken = "" }, nil)
	if c, _ := adminCall(t, e, "GET", "/admin/api/users", "", nil); c != 401 {
		t.Fatalf("no token: %d", c)
	}
	if c, _ := adminCall(t, e, "GET", "/admin/api/users", "wrong", nil); c != 401 {
		t.Fatalf("wrong token: %d", c)
	}
	// page + CSP, no inline script, no innerHTML
	req, _ := http.NewRequest("GET", e.ts.URL+"/admin", nil)
	resp, _ := http.DefaultClient.Do(req)
	pg, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(resp.Header.Get("Content-Security-Policy"), "default-src 'none'") || bytes.Contains(pg, []byte("<script>")) {
		t.Fatal("admin page missing CSP or has inline script")
	}
	js, _ := os.ReadFile("../../../server/sync/syncserver/adminui/app.js")
	if bytes.Contains(js, []byte("innerHTML")) {
		t.Fatal("admin JS uses innerHTML")
	}

	// invites gate registration (no static token configured)
	if _, _, err := sc.Register(ctx(), e.ts.URL, "xena", "admin test pass 1", "guess", "d", &sc.MemStateStore{}, nil); err == nil {
		t.Fatal("registered without a valid invite")
	}
	code, b := adminCall(t, e, "POST", "/admin/api/invites", adm, map[string]any{"label": "for xena", "uses": 1})
	if code != 200 {
		t.Fatalf("create invite: %d %s", code, b)
	}
	var iv struct{ Token string }
	_ = json.Unmarshal(b, &iv)
	xena, _, err := sc.Register(ctx(), e.ts.URL, "xena", "admin test pass 1", iv.Token, "xena-laptop", &sc.MemStateStore{}, nil)
	if err != nil {
		t.Fatalf("register with invite: %v", err)
	}
	if _, _, err := sc.Register(ctx(), e.ts.URL, "yan", "admin test pass 2", iv.Token, "d", &sc.MemStateStore{}, nil); err == nil {
		t.Fatal("single-use invite used twice")
	}
	xe := &device{acct: xena, eng: e.newEngine(xena), name: "x"}
	must(t, xe.eng.SetSetting("secret.setting.name", "SECRET-VALUE"))
	xe.sync(t)

	// metadata views never contain content, keys or blobs
	_, users := adminCall(t, e, "GET", "/admin/api/users", adm, nil)
	_, health := adminCall(t, e, "GET", "/admin/api/health", adm, nil)
	_, devs := adminCall(t, e, "GET", "/admin/api/users/xena/devices", adm, nil)
	all := string(users) + string(health) + string(devs)
	for _, bad := range []string{"blob", "SECRET", "secret.setting", "pkg", "sign_pub", "box_pub", "token_hash"} {
		if strings.Contains(all, bad) {
			t.Fatalf("admin output leaks %q: %s", bad, all)
		}
	}
	if !strings.Contains(string(users), "xena") || !strings.Contains(string(devs), "xena-laptop") {
		t.Fatal("admin lists missing metadata")
	}

	// quota
	if c, _ := adminCall(t, e, "POST", "/admin/api/users/xena/quota", adm, map[string]any{"quota_bytes": 300}); c != 200 {
		t.Fatal("set quota")
	}
	must(t, xe.eng.Put(sc.Passwords, "big", sc.PasswordItem{Password: strings.Repeat("x", 2000)}))
	rep, _ := xe.eng.Sync(ctx())
	if len(rep.Rejected) == 0 || !strings.Contains(rep.Rejected[0], "quota") {
		t.Fatalf("per-user quota not enforced: %v", rep.Rejected)
	}

	// admin cannot approve: no such route, and a pending device stays pending with no keys
	pend, err := sc.Login(ctx(), e.ts.URL, "xena", "admin test pass 1", "pending-dev", &sc.MemStateStore{}, nil)
	must(t, err)
	_, dl := adminCall(t, e, "GET", "/admin/api/users/xena/devices", adm, nil)
	var dd struct {
		Devices []struct{ ID, Name, State string }
	}
	_ = json.Unmarshal(dl, &dd)
	var pid string
	for _, d := range dd.Devices {
		if d.Name == "pending-dev" {
			pid = d.ID
		}
	}
	for _, m := range []string{"POST", "PUT", "PATCH", "GET"} {
		for _, p := range []string{"approve", "approved", "pkg"} {
			c, _ := adminCall(t, e, m, "/admin/api/users/xena/devices/"+pid+"/"+p, adm, map[string]any{"pkg": "AAAA"})
			if c != 404 && c != 405 {
				t.Fatalf("admin approve-like route %s %s answered %d", m, p, c)
			}
		}
	}
	must(t, pend.Poll(ctx()))
	if pend.Approved() || pend.St.Keybag != nil {
		t.Fatal("admin path produced an approved device")
	}

	// admin revoke blocks a device at the server
	if c, _ := adminCall(t, e, "POST", "/admin/api/users/xena/devices/"+xena.St.DeviceID+"/revoke", adm, nil); c != 200 {
		t.Fatal("admin revoke")
	}
	if _, err := xe.eng.Sync(ctx()); err == nil {
		t.Fatal("admin-revoked device still syncs")
	}

	// invite delete, user delete
	_, il := adminCall(t, e, "GET", "/admin/api/invites", adm, nil)
	if strings.Contains(string(il), iv.Token) {
		t.Fatal("invite token stored/listed in clear")
	}
	if c, _ := adminCall(t, e, "DELETE", "/admin/api/users/xena", adm, nil); c != 200 {
		t.Fatal("delete user")
	}
	if c, _ := adminCall(t, e, "DELETE", "/admin/api/users/xena", adm, nil); c != 404 {
		t.Fatal("double delete")
	}
	// admin API fuzz-lite: hostile paths/bodies never 5xx
	for _, p := range []string{"/admin/api/users/%00/quota", "/admin/api/invites/zz", "/admin/api/users/" + strings.Repeat("a", 5000) + "/devices", "/admin/api/invites/../x"} {
		for _, m := range []string{"GET", "POST", "DELETE"} {
			if c, _ := adminCall(t, e, m, p, adm, map[string]any{"quota_bytes": "x", "uses": -1}); c >= 500 {
				t.Fatalf("%s %s -> %d", m, p, c)
			}
		}
	}
}
