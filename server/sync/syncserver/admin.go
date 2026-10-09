package syncserver

import (
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"net/http"
	"sort"
	"strings"
)

// The optional admin UI is OFF unless Config.AdminToken is set. It exposes
// metadata only (usernames, sizes, device names/states, invites). It has no route that
// reads record contents or keys and, by design, NO route that approves a device:
// approval is a cryptographic key hand-off between the user's own devices.

//go:embed adminui/*
var adminFS embed.FS

func collectionNames() []string {
	var out []string
	for k := range collections {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func (s *Server) quotaFor(acct int64) int64 {
	var q int64
	_ = s.st.db.QueryRow(`SELECT quota_bytes FROM accounts WHERE id=?`, acct).Scan(&q)
	if q == 0 {
		return s.cfg.QuotaBytes
	}
	return q
}

func inviteDigest(token string) []byte { return tokenHash("invite:" + token) }

// inviteHash returns the stored hash if token is a valid unused invite, else nil.
func (s *Server) inviteHash(token string) []byte {
	if token == "" || len(token) > 200 {
		return nil
	}
	h := inviteDigest(token)
	var n int
	if s.st.db.QueryRow(`SELECT uses_left FROM invites WHERE token_hash=?`, h).Scan(&n) != nil || n <= 0 {
		return nil
	}
	return h
}

func (s *Server) adminAuth(h http.HandlerFunc) http.HandlerFunc {
	return s.authLimited(func(w http.ResponseWriter, r *http.Request) {
		a := r.Header.Get("Authorization")
		if !strings.HasPrefix(a, "Bearer ") || subtle.ConstantTimeCompare([]byte(a[7:]), []byte(s.cfg.AdminToken)) != 1 {
			writeErr(w, 401, "unauthorized")
			return
		}
		h(w, r)
	})
}

func (s *Server) adminRoutes(m *http.ServeMux) {
	asset := func(name, ctype string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			b, _ := adminFS.ReadFile("adminui/" + name)
			w.Header().Set("Content-Type", ctype)
			w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
			_, _ = w.Write(b)
		}
	}
	m.HandleFunc("GET /admin", asset("index.html", "text/html; charset=utf-8"))
	m.HandleFunc("GET /admin/app.js", asset("app.js", "text/javascript"))
	m.HandleFunc("GET /admin/app.css", asset("app.css", "text/css"))
	m.HandleFunc("GET /admin/api/health", s.adminAuth(s.aHealth))
	m.HandleFunc("GET /admin/api/users", s.adminAuth(s.aUsers))
	m.HandleFunc("POST /admin/api/users/{user}/quota", s.adminAuth(s.aQuota))
	m.HandleFunc("DELETE /admin/api/users/{user}", s.adminAuth(s.aDeleteUser))
	m.HandleFunc("GET /admin/api/users/{user}/devices", s.adminAuth(s.aDevices))
	m.HandleFunc("POST /admin/api/users/{user}/devices/{id}/revoke", s.adminAuth(s.aRevoke))
	m.HandleFunc("GET /admin/api/invites", s.adminAuth(s.aInvites))
	m.HandleFunc("POST /admin/api/invites", s.adminAuth(s.aNewInvite))
	m.HandleFunc("DELETE /admin/api/invites/{id}", s.adminAuth(s.aDelInvite))
}

func (s *Server) aHealth(w http.ResponseWriter, r *http.Request) {
	var users, devices int
	var used int64
	_ = s.st.db.QueryRow(`SELECT COUNT(1), COALESCE(SUM(used_bytes),0) FROM accounts`).Scan(&users, &used)
	_ = s.st.db.QueryRow(`SELECT COUNT(1) FROM devices WHERE state!='revoked'`).Scan(&devices)
	ok := s.st.db.Ping() == nil
	writeJSON(w, 200, map[string]any{"ok": ok, "version": Version, "schema": SchemaVersion, "users": users, "devices": devices,
		"used_bytes": used, "registration": s.cfg.Registration})
}

func (s *Server) aUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.st.db.Query(`SELECT a.username,a.created_at,a.used_bytes,a.quota_bytes,a.rec_count,
(SELECT COUNT(1) FROM devices d WHERE d.account_id=a.id AND d.state='approved'),
(SELECT COUNT(1) FROM devices d WHERE d.account_id=a.id AND d.state='pending')
FROM accounts a ORDER BY a.username`)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer rows.Close()
	type u struct {
		Username string `json:"username"`
		Created  int64  `json:"created_at"`
		Used     int64  `json:"used_bytes"`
		Quota    int64  `json:"quota_bytes"`
		Records  int    `json:"records"`
		Approved int    `json:"approved_devices"`
		Pending  int    `json:"pending_devices"`
	}
	out := []u{}
	for rows.Next() {
		var x u
		if rows.Scan(&x.Username, &x.Created, &x.Used, &x.Quota, &x.Records, &x.Approved, &x.Pending) == nil {
			if x.Quota == 0 {
				x.Quota = s.cfg.QuotaBytes
			}
			out = append(out, x)
		}
	}
	writeJSON(w, 200, map[string]any{"users": out})
}

func (s *Server) aQuota(w http.ResponseWriter, r *http.Request) {
	var in struct {
		QuotaBytes int64 `json:"quota_bytes"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.QuotaBytes < 0 || in.QuotaBytes > 1<<40 {
		writeErr(w, 400, "bad_quota")
		return
	}
	res, err := s.st.db.Exec(`UPDATE accounts SET quota_bytes=? WHERE username=?`, in.QuotaBytes, r.PathValue("user"))
	if n, _ := res.RowsAffected(); err != nil || n == 0 {
		writeErr(w, 404, "no_such_user")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) aDeleteUser(w http.ResponseWriter, r *http.Request) {
	res, err := s.st.db.Exec(`DELETE FROM accounts WHERE username=?`, r.PathValue("user"))
	if n, _ := res.RowsAffected(); err != nil || n == 0 {
		writeErr(w, 404, "no_such_user")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

func (s *Server) aDevices(w http.ResponseWriter, r *http.Request) {
	rows, err := s.st.db.Query(`SELECT d.id,d.name,d.state,d.created_at,d.last_seen FROM devices d JOIN accounts a ON a.id=d.account_id WHERE a.username=? ORDER BY d.created_at`, r.PathValue("user"))
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer rows.Close()
	type d struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		State    string `json:"state"`
		Created  int64  `json:"created_at"`
		LastSeen int64  `json:"last_seen"`
	}
	out := []d{}
	for rows.Next() {
		var x d
		if rows.Scan(&x.ID, &x.Name, &x.State, &x.Created, &x.LastSeen) == nil {
			out = append(out, x)
		}
	}
	writeJSON(w, 200, map[string]any{"devices": out})
}

// aRevoke blocks a device at the server (sessions removed, state revoked). It cannot rotate keys
// (the server has none); the user should rotate by revoking from a trusted device.
func (s *Server) aRevoke(w http.ResponseWriter, r *http.Request) {
	var acct int64
	if s.st.db.QueryRow(`SELECT id FROM accounts WHERE username=?`, r.PathValue("user")).Scan(&acct) != nil {
		writeErr(w, 404, "no_such_user")
		return
	}
	res, err := s.st.db.Exec(`UPDATE devices SET state='revoked', pkg=NULL WHERE account_id=? AND id=?`, acct, r.PathValue("id"))
	if n, _ := res.RowsAffected(); err != nil || n == 0 {
		writeErr(w, 404, "no_such_device")
		return
	}
	_, _ = s.st.db.Exec(`DELETE FROM sessions WHERE account_id=? AND device_id=?`, acct, r.PathValue("id"))
	writeJSON(w, 200, map[string]any{"status": "revoked", "note": "server-side block only; no key rotation was performed"})
}

func (s *Server) aInvites(w http.ResponseWriter, r *http.Request) {
	rows, err := s.st.db.Query(`SELECT token_hash,label,uses_left,created_at FROM invites ORDER BY created_at`)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer rows.Close()
	type iv struct {
		ID       string `json:"id"`
		Label    string `json:"label"`
		UsesLeft int    `json:"uses_left"`
		Created  int64  `json:"created_at"`
	}
	out := []iv{}
	for rows.Next() {
		var h []byte
		var x iv
		if rows.Scan(&h, &x.Label, &x.UsesLeft, &x.Created) == nil {
			x.ID = hex.EncodeToString(h)[:12]
			out = append(out, x)
		}
	}
	writeJSON(w, 200, map[string]any{"invites": out})
}

func (s *Server) aNewInvite(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Label string `json:"label"`
		Uses  int    `json:"uses"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Uses < 1 || in.Uses > 1000 || len(in.Label) > 64 {
		writeErr(w, 400, "bad_invite")
		return
	}
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	tok := "inv_" + hex.EncodeToString(b)
	if _, err := s.st.db.Exec(`INSERT INTO invites(token_hash,label,uses_left,created_at) VALUES(?,?,?,?)`, inviteDigest(tok), in.Label, in.Uses, s.now().Unix()); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]any{"token": tok}) // shown once; only its hash is stored
}

func (s *Server) aDelInvite(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if len(id) < 8 || len(id) > 12 {
		writeErr(w, 400, "bad_id")
		return
	}
	res, err := s.st.db.Exec(`DELETE FROM invites WHERE lower(hex(token_hash)) LIKE ?`, strings.ToLower(id)+"%")
	if n, _ := res.RowsAffected(); err != nil || n == 0 {
		writeErr(w, 404, "no_such_invite")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}
