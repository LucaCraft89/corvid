package syncserver

import (
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bytemare/opaque"
)

// Version is reported by /v1/info.
const Version = "0.1.0-draft"

const (
	serverID = "corvid-sync"

	stateApproved = "approved"
	statePending  = "pending"
	stateRevoked  = "revoked"
)

// Collections the server accepts. Names are visible to the server (metadata).
var collections = map[string]bool{
	"bookmarks": true, "passwords": true, "passkeys": true, "settings": true,
	"layouts": true, "modules": true, "extensions": true, "themes": true, "history": true, "tabs": true,
	// NOTE: there is deliberately no "cookies" collection. Cookies never sync.
}

var (
	reUser   = regexp.MustCompile(`^[A-Za-z0-9._@+-]{3,64}$`)
	reDevice = regexp.MustCompile(`^[0-9a-f]{32}$`)
	reRid    = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// Server is the HTTP handler for the sync API.
type Server struct {
	cfg   Config
	st    *Store
	conf  *opaque.Configuration
	op    *opaque.Server
	skm   *opaque.ServerKeyMaterial
	mux   *http.ServeMux
	gen   *limiter
	auth  *limiter
	fails *failTracker

	mu     sync.Mutex
	regs   map[string]*pendingReg
	logins map[string]*pendingLogin
	nonces map[string]*pendingNonce
	fakes  map[string]*opaque.ClientRecord
	secret []byte // for fake cred ids
}

type pendingReg struct {
	user   string
	cred   []byte
	exp    time.Time
	pw     bool   // password change rather than registration
	acct   int64  // for password change
	invite []byte // hash of the invite consumed on registration
}
type pendingLogin struct {
	user string
	key  string
	mac  []byte
	exp  time.Time
}
type pendingNonce struct {
	user string
	exp  time.Time
}

// New opens the store, loads or creates key material, and builds the handler.
func New(cfg Config) (*Server, error) {
	cfg.Normalize()
	if cfg.Registration == RegToken && cfg.RegToken == "" && cfg.AdminToken == "" {
		return nil, errors.New("registration=token requires a registration token (or the admin UI to create invites)")
	}
	st, err := OpenStore(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	conf := opaque.DefaultConfiguration()
	skm, secret, err := loadKeys(conf, cfg.KeyFile)
	if err != nil {
		st.Close()
		return nil, err
	}
	op, err := conf.Server()
	if err != nil {
		return nil, err
	}
	if err := op.SetKeyMaterial(skm); err != nil {
		return nil, err
	}
	s := &Server{
		cfg: cfg, st: st, conf: conf, op: op, skm: skm, secret: secret,
		gen:    newLimiter(cfg.GeneralPerMin, cfg.Now),
		auth:   newLimiter(cfg.AuthPerMin, cfg.Now),
		fails:  newFailTracker(cfg.LoginFailLimit, cfg.Now),
		regs:   map[string]*pendingReg{},
		logins: map[string]*pendingLogin{},
		nonces: map[string]*pendingNonce{},
		fakes:  map[string]*opaque.ClientRecord{},
	}
	s.routes()
	return s, nil
}

// Close releases the database.
func (s *Server) Close() error { return s.st.Close() }

// ServeHTTP implements http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil { // never crash on hostile input
			writeErr(w, 500, "internal")
		}
	}()
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	ip := s.clientIP(r)
	if !s.gen.allow(ip) {
		w.Header().Set("Retry-After", "5")
		writeErr(w, 429, "rate_limited")
		return
	}
	if p := r.URL.Path; p != "/" && path.Clean(p) != p { // no mux redirects, no traversal tricks
		writeErr(w, 400, "bad_path")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxBodyBytes)
	s.mux.ServeHTTP(w, r)
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
			return strings.TrimSpace(strings.Split(xf, ",")[0])
		}
	}
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

// loadKeys loads the OPAQUE key material and a local secret, creating them on first start.
func loadKeys(conf *opaque.Configuration, path string) (*opaque.ServerKeyMaterial, []byte, error) {
	if path == "" {
		return nil, nil, errors.New("key file path required")
	}
	if b, err := os.ReadFile(path); err == nil {
		var kf struct {
			SKM    string `json:"opaque_key_material"`
			Secret string `json:"secret"`
		}
		if err := json.Unmarshal(b, &kf); err != nil {
			return nil, nil, fmt.Errorf("key file: %w", err)
		}
		skm, err := conf.DecodeServerKeyMaterialHex(kf.SKM)
		if err != nil {
			return nil, nil, fmt.Errorf("key file: %w", err)
		}
		sec, err := hex.DecodeString(kf.Secret)
		if err != nil || len(sec) != 32 {
			return nil, nil, errors.New("key file: bad secret")
		}
		return skm, sec, nil
	}
	sk, pk := conf.KeyGen()
	skm := &opaque.ServerKeyMaterial{
		Identity: []byte(serverID), PrivateKey: sk, PublicKeyBytes: pk.Encode(),
		OPRFGlobalSeed: conf.GenerateOPRFSeed(),
	}
	sec := opaque.RandomBytes(32)
	out, _ := json.Marshal(map[string]string{"opaque_key_material": skm.Hex(), "secret": hex.EncodeToString(sec)})
	if err := os.WriteFile(path, out, 0o600); err != nil {
		return nil, nil, err
	}
	return skm, sec, nil
}

// ---------- helpers ----------

type apiErr struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) { writeJSON(w, code, apiErr{msg}) }

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if ct := r.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(ct, "application/json") {
		writeErr(w, 415, "content_type")
		return false
	}
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writeErr(w, 413, "too_large")
		} else {
			writeErr(w, 400, "bad_json")
		}
		return false
	}
	if _, err := dec.Token(); err != io.EOF {
		writeErr(w, 400, "bad_json")
		return false
	}
	return true
}

func tokenHash(t string) []byte { h := sha256.Sum256([]byte(t)); return h[:] }

func newToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return "cs_" + base64.RawURLEncoding.EncodeToString(b)
}

func randID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) now() time.Time { return s.cfg.Now() }

// ---------- wire types ----------

// DeviceInfo describes a device on the wire.
type DeviceInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Pub  []byte `json:"pub"` // X25519 public key
}

func (d DeviceInfo) valid() bool {
	if !reDevice.MatchString(d.ID) || len(d.Pub) != 32 || len(d.Name) > 64 {
		return false
	}
	for _, c := range d.Name {
		if c < 0x20 || c == 0x7f {
			return false
		}
	}
	return true
}

// RecoveryInfo holds the public recovery material and the sealed keybag.
type RecoveryInfo struct {
	SignPub []byte `json:"sign_pub"` // Ed25519
	BoxPub  []byte `json:"box_pub"`  // X25519
	Pkg     []byte `json:"pkg"`      // sealed box of the keybag to BoxPub
}

func (r RecoveryInfo) valid() bool {
	return len(r.SignPub) == ed25519.PublicKeySize && len(r.BoxPub) == 32 && len(r.Pkg) > 0 && len(r.Pkg) <= 16<<10
}

// ---------- routes ----------

func (s *Server) routes() {
	m := http.NewServeMux()
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	m.HandleFunc("GET /v1/info", s.hInfo)
	pre := func(h http.HandlerFunc) http.HandlerFunc { return s.authLimited(h) }
	m.HandleFunc("POST /v1/register/start", pre(s.hRegisterStart))
	m.HandleFunc("POST /v1/register/finish", pre(s.hRegisterFinish))
	m.HandleFunc("POST /v1/login/start", pre(s.hLoginStart))
	m.HandleFunc("POST /v1/login/finish", pre(s.hLoginFinish))
	m.HandleFunc("POST /v1/recovery/challenge", pre(s.hRecoveryChallenge))
	m.HandleFunc("POST /v1/recovery/login", pre(s.hRecoveryLogin))

	m.HandleFunc("GET /v1/devices/self", s.session(false, s.hDeviceSelf))
	m.HandleFunc("GET /v1/devices", s.session(true, s.hDevices))
	m.HandleFunc("POST /v1/devices/{id}/approve", s.session(true, s.hApprove))
	m.HandleFunc("POST /v1/devices/{id}/revoke", s.session(true, s.hRevoke))
	m.HandleFunc("GET /v1/keys", s.session(true, s.hKeys))
	m.HandleFunc("POST /v1/password/start", s.session(true, s.hPasswordStart))
	m.HandleFunc("POST /v1/password/finish", s.session(true, s.hPasswordFinish))
	m.HandleFunc("POST /v1/recovery/rotate", s.session(true, s.hRecoveryRotate))
	m.HandleFunc("POST /v1/records/push", s.session(true, s.hPush))
	m.HandleFunc("GET /v1/records/pull", s.session(true, s.hPull))
	m.HandleFunc("DELETE /v1/account", s.session(true, s.hDeleteAccount))
	m.HandleFunc("GET /v1/stats", s.session(true, s.hStats))
	if s.cfg.AdminToken != "" {
		s.adminRoutes(m)
	}
	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { writeErr(w, 404, "not_found") })
	s.mux = m
}

func (s *Server) authLimited(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.auth.allow(s.clientIP(r)) {
			w.Header().Set("Retry-After", "30")
			writeErr(w, 429, "rate_limited")
			return
		}
		h(w, r)
	}
}

type sess struct {
	acct   int64
	device string
	state  string
}

type sessHandler func(w http.ResponseWriter, r *http.Request, se sess)

// session authenticates the bearer token. If needApproved, pending/revoked devices are refused.
func (s *Server) session(needApproved bool, h sessHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a := r.Header.Get("Authorization")
		if !strings.HasPrefix(a, "Bearer ") || len(a) > 200 {
			writeErr(w, 401, "unauthorized")
			return
		}
		var se sess
		var exp int64
		err := s.st.db.QueryRow(`SELECT s.account_id, s.device_id, s.expires_at, COALESCE(d.state,'revoked')
FROM sessions s LEFT JOIN devices d ON d.account_id=s.account_id AND d.id=s.device_id
WHERE s.token_hash=?`, tokenHash(a[7:])).Scan(&se.acct, &se.device, &exp, &se.state)
		if err != nil || exp < s.now().Unix() || se.state == stateRevoked {
			writeErr(w, 401, "unauthorized")
			return
		}
		if needApproved && se.state != stateApproved {
			writeErr(w, 403, "device_not_approved")
			return
		}
		_, _ = s.st.db.Exec(`UPDATE devices SET last_seen=? WHERE account_id=? AND id=?`, s.now().Unix(), se.acct, se.device)
		h(w, r, se)
	}
}

func (s *Server) newSession(acct int64, device string) (string, error) {
	t := newToken()
	_, err := s.st.db.Exec(`INSERT INTO sessions(token_hash,account_id,device_id,expires_at) VALUES(?,?,?,?)`,
		tokenHash(t), acct, device, s.now().Add(s.cfg.SessionTTL).Unix())
	return t, err
}

// ---------- info ----------

func (s *Server) hInfo(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"version": Version, "schema": SchemaVersion, "registration": s.cfg.Registration,
		"limits": map[string]any{
			"max_record_bytes": s.cfg.MaxRecordBytes, "max_batch": s.cfg.MaxBatch,
			"quota_bytes": s.cfg.QuotaBytes, "max_body_bytes": s.cfg.MaxBodyBytes,
		},
		"collections": collectionNames(),
	})
}

// ---------- registration ----------

func (s *Server) gcPending() {
	t := s.now()
	for k, v := range s.regs {
		if t.After(v.exp) {
			delete(s.regs, k)
		}
	}
	for k, v := range s.logins {
		if t.After(v.exp) {
			delete(s.logins, k)
		}
	}
	for k, v := range s.nonces {
		if t.After(v.exp) {
			delete(s.nonces, k)
		}
	}
}

const pendingCap = 20000

func (s *Server) hRegisterStart(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		Request  []byte `json:"request"`
		Token    string `json:"token"`
	}
	if !decode(w, r, &in) {
		return
	}
	var inv []byte
	switch s.cfg.Registration {
	case RegClosed:
		writeErr(w, 403, "registration_closed")
		return
	case RegToken:
		master := s.cfg.RegToken != "" && subtle.ConstantTimeCompare([]byte(in.Token), []byte(s.cfg.RegToken)) == 1
		if !master {
			if inv = s.inviteHash(in.Token); inv == nil {
				writeErr(w, 403, "bad_registration_token")
				return
			}
		}
	}
	if !reUser.MatchString(in.Username) {
		writeErr(w, 400, "bad_username")
		return
	}
	var n int
	_ = s.st.db.QueryRow(`SELECT COUNT(1) FROM accounts WHERE username=?`, in.Username).Scan(&n)
	if n > 0 {
		writeErr(w, 409, "username_unavailable")
		return
	}
	req, err := s.op.Deserialize.RegistrationRequest(in.Request)
	if err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	cred := opaque.RandomBytes(64)
	resp, err := s.op.RegistrationResponse(req, cred, nil)
	if err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	id := randID()
	s.mu.Lock()
	s.gcPending()
	if len(s.regs) >= pendingCap {
		s.mu.Unlock()
		writeErr(w, 429, "busy")
		return
	}
	s.regs[id] = &pendingReg{user: in.Username, cred: cred, exp: s.now().Add(2 * time.Minute), invite: inv}
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"reg_id": id, "response": resp.Serialize()})
}

func (s *Server) takeReg(id string, pw bool) *pendingReg {
	s.mu.Lock()
	defer s.mu.Unlock()
	p := s.regs[id]
	if p == nil || p.pw != pw || s.now().After(p.exp) {
		return nil
	}
	delete(s.regs, id)
	return p
}

func (s *Server) hRegisterFinish(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RegID    string       `json:"reg_id"`
		Record   []byte       `json:"record"`
		Recovery RecoveryInfo `json:"recovery"`
		Device   DeviceInfo   `json:"device"`
	}
	if !decode(w, r, &in) {
		return
	}
	p := s.takeReg(in.RegID, false)
	if p == nil {
		writeErr(w, 400, "bad_registration")
		return
	}
	if !in.Device.valid() || !in.Recovery.valid() {
		writeErr(w, 400, "bad_request")
		return
	}
	rec, err := s.op.Deserialize.RegistrationRecord(in.Record)
	if err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	_ = rec // validated; stored in serialized form
	tx, err := s.st.db.Begin()
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer tx.Rollback()
	now := s.now().Unix()
	res, err := tx.Exec(`INSERT INTO accounts(username,cred_id,opaque_record,rec_sign_pub,rec_box_pub,rec_pkg,created_at)
VALUES(?,?,?,?,?,?,?)`, p.user, p.cred, in.Record, in.Recovery.SignPub, in.Recovery.BoxPub, in.Recovery.Pkg, now)
	if err != nil {
		writeErr(w, 409, "username_unavailable")
		return
	}
	acct, _ := res.LastInsertId()
	if p.invite != nil {
		r2, err := tx.Exec(`UPDATE invites SET uses_left=uses_left-1 WHERE token_hash=? AND uses_left>0`, p.invite)
		if n, _ := r2.RowsAffected(); err != nil || n == 0 {
			writeErr(w, 403, "bad_registration_token")
			return
		}
	}
	if _, err := tx.Exec(`INSERT INTO devices(account_id,id,name,pub,state,created_at,last_seen) VALUES(?,?,?,?,?,?,?)`,
		acct, in.Device.ID, in.Device.Name, in.Device.Pub, stateApproved, now, now); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	tok, err := s.newSession(acct, in.Device.ID)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]any{"token": tok, "epoch": 0, "state": stateApproved})
}

// ---------- login ----------

type account struct {
	id     int64
	user   string
	cred   []byte
	record []byte
	epoch  int
}

func (s *Server) loadAccount(user string) (*account, error) {
	a := &account{}
	err := s.st.db.QueryRow(`SELECT id,username,cred_id,opaque_record,epoch FROM accounts WHERE username=?`, user).
		Scan(&a.id, &a.user, &a.cred, &a.record, &a.epoch)
	if err != nil {
		return nil, err
	}
	return a, nil
}

func (s *Server) fakeRecord(user string) *opaque.ClientRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	if f := s.fakes[user]; f != nil {
		return f
	}
	if len(s.fakes) > 10000 {
		s.fakes = map[string]*opaque.ClientRecord{}
	}
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte("fake:" + user))
	f, _ := s.conf.GetFakeRecord(mac.Sum(nil))
	s.fakes[user] = f
	return f
}

func (s *Server) hLoginStart(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		KE1      []byte `json:"ke1"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !reUser.MatchString(in.Username) {
		writeErr(w, 401, "login_failed")
		return
	}
	// In OPAQUE a wrong passphrase is only detectable by the client, so a guess costs the
	// attacker exactly one login/start. Every start therefore counts as an attempt until a
	// login for that (user, ip) completes successfully.
	fkey := in.Username + "|" + s.clientIP(r)
	if s.fails.locked(fkey) {
		w.Header().Set("Retry-After", "30")
		writeErr(w, 429, "too_many_attempts")
		return
	}
	ke1, err := s.op.Deserialize.KE1(in.KE1)
	if err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	s.fails.fail(fkey)
	var rec *opaque.ClientRecord
	if a, err := s.loadAccount(in.Username); err == nil {
		rr, err := s.op.Deserialize.RegistrationRecord(a.record)
		if err != nil {
			writeErr(w, 500, "internal")
			return
		}
		rec = &opaque.ClientRecord{CredentialIdentifier: a.cred, ClientIdentity: []byte(a.user), RegistrationRecord: rr}
	} else {
		rec = s.fakeRecord(in.Username)
	}
	ke2, out, err := s.op.GenerateKE2(ke1, rec)
	if err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	id := randID()
	s.mu.Lock()
	s.gcPending()
	if len(s.logins) >= pendingCap {
		s.mu.Unlock()
		writeErr(w, 429, "busy")
		return
	}
	s.logins[id] = &pendingLogin{user: in.Username, key: fkey, mac: out.ClientMAC, exp: s.now().Add(60 * time.Second)}
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"login_id": id, "ke2": ke2.Serialize()})
}

func (s *Server) hLoginFinish(w http.ResponseWriter, r *http.Request) {
	var in struct {
		LoginID string     `json:"login_id"`
		KE3     []byte     `json:"ke3"`
		Device  DeviceInfo `json:"device"`
	}
	if !decode(w, r, &in) {
		return
	}
	s.mu.Lock()
	p := s.logins[in.LoginID]
	delete(s.logins, in.LoginID) // single use
	s.mu.Unlock()
	if p == nil || s.now().After(p.exp) {
		writeErr(w, 401, "login_failed")
		return
	}
	ke3, err := s.op.Deserialize.KE3(in.KE3)
	if err != nil || s.op.LoginFinish(ke3, p.mac) != nil {
		writeErr(w, 401, "login_failed")
		return
	}
	a, err := s.loadAccount(p.user)
	if err != nil { // fake record cannot pass LoginFinish; defensive
		writeErr(w, 401, "login_failed")
		return
	}
	s.fails.ok(p.key)
	if !in.Device.valid() {
		writeErr(w, 400, "bad_device")
		return
	}
	var state string
	err = s.st.db.QueryRow(`SELECT state FROM devices WHERE account_id=? AND id=?`, a.id, in.Device.ID).Scan(&state)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		var n int
		_ = s.st.db.QueryRow(`SELECT COUNT(1) FROM devices WHERE account_id=? AND state!=?`, a.id, stateRevoked).Scan(&n)
		if n >= s.cfg.MaxDevices {
			writeErr(w, 403, "device_limit")
			return
		}
		now := s.now().Unix()
		if _, err := s.st.db.Exec(`INSERT INTO devices(account_id,id,name,pub,state,created_at,last_seen) VALUES(?,?,?,?,?,?,?)`,
			a.id, in.Device.ID, in.Device.Name, in.Device.Pub, statePending, now, now); err != nil {
			writeErr(w, 500, "internal")
			return
		}
		state = statePending
	case err != nil:
		writeErr(w, 500, "internal")
		return
	case state == stateRevoked:
		writeErr(w, 403, "device_revoked")
		return
	}
	tok, err := s.newSession(a.id, in.Device.ID)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]any{"token": tok, "state": state, "epoch": a.epoch})
}

// ---------- recovery login ----------

func (s *Server) hRecoveryChallenge(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
	}
	if !decode(w, r, &in) {
		return
	}
	nonce := randID() + randID()
	s.mu.Lock()
	s.gcPending()
	if len(s.nonces) >= pendingCap {
		s.mu.Unlock()
		writeErr(w, 429, "busy")
		return
	}
	s.nonces[nonce] = &pendingNonce{user: in.Username, exp: s.now().Add(60 * time.Second)}
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"nonce": nonce}) // same answer for unknown users
}

// RecoveryMessage is what the recovery key signs.
func RecoveryMessage(user, nonce string) []byte {
	return []byte("corvid-sync/v1/recover\x00" + user + "\x00" + nonce)
}

func (s *Server) hRecoveryLogin(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string     `json:"username"`
		Nonce    string     `json:"nonce"`
		Sig      []byte     `json:"sig"`
		Device   DeviceInfo `json:"device"`
	}
	if !decode(w, r, &in) {
		return
	}
	fail := func() { writeErr(w, 401, "recovery_failed") }
	fkey := in.Username + "|" + s.clientIP(r)
	if s.fails.locked(fkey) {
		writeErr(w, 429, "too_many_attempts")
		return
	}
	s.mu.Lock()
	n := s.nonces[in.Nonce]
	delete(s.nonces, in.Nonce)
	s.mu.Unlock()
	if n == nil || n.user != in.Username || s.now().After(n.exp) || !in.Device.valid() {
		fail()
		return
	}
	var acct int64
	var signPub, pkg []byte
	var epoch int
	err := s.st.db.QueryRow(`SELECT id,rec_sign_pub,rec_pkg,epoch FROM accounts WHERE username=?`, in.Username).Scan(&acct, &signPub, &pkg, &epoch)
	if err != nil || len(signPub) != ed25519.PublicKeySize || !ed25519.Verify(signPub, RecoveryMessage(in.Username, in.Nonce), in.Sig) {
		s.fails.fail(fkey)
		fail()
		return
	}
	s.fails.ok(fkey)
	now := s.now().Unix()
	var cnt int
	_ = s.st.db.QueryRow(`SELECT COUNT(1) FROM devices WHERE account_id=? AND state!=?`, acct, stateRevoked).Scan(&cnt)
	var existing string
	e := s.st.db.QueryRow(`SELECT state FROM devices WHERE account_id=? AND id=?`, acct, in.Device.ID).Scan(&existing)
	if errors.Is(e, sql.ErrNoRows) {
		if cnt >= s.cfg.MaxDevices {
			writeErr(w, 403, "device_limit")
			return
		}
		_, e = s.st.db.Exec(`INSERT INTO devices(account_id,id,name,pub,state,created_at,last_seen) VALUES(?,?,?,?,?,?,?)`,
			acct, in.Device.ID, in.Device.Name, in.Device.Pub, stateApproved, now, now)
	} else if e == nil {
		if existing == stateRevoked {
			writeErr(w, 403, "device_revoked")
			return
		}
		_, e = s.st.db.Exec(`UPDATE devices SET state=?, pub=?, name=? WHERE account_id=? AND id=?`, stateApproved, in.Device.Pub, in.Device.Name, acct, in.Device.ID)
	}
	if e != nil {
		writeErr(w, 500, "internal")
		return
	}
	tok, err := s.newSession(acct, in.Device.ID)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]any{"token": tok, "state": stateApproved, "epoch": epoch, "recovery_pkg": pkg})
}

// ---------- devices ----------

func (s *Server) hDeviceSelf(w http.ResponseWriter, r *http.Request, se sess) {
	var pkg []byte
	var epoch int
	_ = s.st.db.QueryRow(`SELECT pkg FROM devices WHERE account_id=? AND id=?`, se.acct, se.device).Scan(&pkg)
	_ = s.st.db.QueryRow(`SELECT epoch FROM accounts WHERE id=?`, se.acct).Scan(&epoch)
	out := map[string]any{"id": se.device, "state": se.state, "epoch": epoch}
	if se.state == stateApproved && pkg != nil {
		out["pkg"] = pkg
	}
	writeJSON(w, 200, out)
}

func (s *Server) hDevices(w http.ResponseWriter, r *http.Request, se sess) {
	rows, err := s.st.db.Query(`SELECT id,name,pub,state,created_at,last_seen FROM devices WHERE account_id=? ORDER BY created_at`, se.acct)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer rows.Close()
	type dev struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Pub      []byte `json:"pub"`
		State    string `json:"state"`
		Created  int64  `json:"created_at"`
		LastSeen int64  `json:"last_seen"`
		Self     bool   `json:"self"`
	}
	out := []dev{}
	for rows.Next() {
		var d dev
		if rows.Scan(&d.ID, &d.Name, &d.Pub, &d.State, &d.Created, &d.LastSeen) == nil {
			d.Self = d.ID == se.device
			out = append(out, d)
		}
	}
	writeJSON(w, 200, map[string]any{"devices": out})
}

func (s *Server) hApprove(w http.ResponseWriter, r *http.Request, se sess) {
	id := r.PathValue("id")
	var in struct {
		Pkg []byte `json:"pkg"`
	}
	if !reDevice.MatchString(id) || !decode(w, r, &in) {
		if !reDevice.MatchString(id) {
			writeErr(w, 400, "bad_device")
		}
		return
	}
	if len(in.Pkg) == 0 || len(in.Pkg) > 16<<10 {
		writeErr(w, 400, "bad_request")
		return
	}
	res, err := s.st.db.Exec(`UPDATE devices SET state=?, pkg=? WHERE account_id=? AND id=? AND state=?`, stateApproved, in.Pkg, se.acct, id, statePending)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, 404, "no_pending_device")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "approved"})
}

func (s *Server) hRevoke(w http.ResponseWriter, r *http.Request, se sess) {
	id := r.PathValue("id")
	var in struct {
		Epoch    int               `json:"epoch"`
		Recovery []byte            `json:"recovery_pkg"`
		Packages map[string][]byte `json:"packages"`
	}
	if !reDevice.MatchString(id) {
		writeErr(w, 400, "bad_device")
		return
	}
	if !decode(w, r, &in) {
		return
	}
	tx, err := s.st.db.Begin()
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer tx.Rollback()
	var state string
	if err := tx.QueryRow(`SELECT state FROM devices WHERE account_id=? AND id=?`, se.acct, id).Scan(&state); err != nil {
		writeErr(w, 404, "no_such_device")
		return
	}
	if state == stateRevoked {
		writeErr(w, 409, "already_revoked")
		return
	}
	if state == stateApproved {
		// Approved devices hold keys: require a rotation covering every remaining approved device.
		var cur int
		_ = tx.QueryRow(`SELECT epoch FROM accounts WHERE id=?`, se.acct).Scan(&cur)
		if in.Epoch != cur+1 || len(in.Recovery) == 0 {
			writeErr(w, 400, "rotation_required")
			return
		}
		rows, err := tx.Query(`SELECT id FROM devices WHERE account_id=? AND state=? AND id!=?`, se.acct, stateApproved, id)
		if err != nil {
			writeErr(w, 500, "internal")
			return
		}
		want := map[string]bool{}
		for rows.Next() {
			var d string
			_ = rows.Scan(&d)
			want[d] = true
		}
		rows.Close()
		if len(in.Packages) != len(want) {
			writeErr(w, 400, "packages_mismatch")
			return
		}
		for d, pkg := range in.Packages {
			if !want[d] || len(pkg) == 0 || len(pkg) > 16<<10 {
				writeErr(w, 400, "packages_mismatch")
				return
			}
		}
		for d, pkg := range in.Packages {
			if _, err := tx.Exec(`UPDATE devices SET pkg=? WHERE account_id=? AND id=?`, pkg, se.acct, d); err != nil {
				writeErr(w, 500, "internal")
				return
			}
		}
		if _, err := tx.Exec(`UPDATE accounts SET epoch=?, rec_pkg=? WHERE id=?`, in.Epoch, in.Recovery, se.acct); err != nil {
			writeErr(w, 500, "internal")
			return
		}
	}
	if _, err := tx.Exec(`UPDATE devices SET state=?, pkg=NULL WHERE account_id=? AND id=?`, stateRevoked, se.acct, id); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if _, err := tx.Exec(`DELETE FROM sessions WHERE account_id=? AND device_id=?`, se.acct, id); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "revoked"})
}

// ---------- keys, password, recovery ----------

func (s *Server) hKeys(w http.ResponseWriter, r *http.Request, se sess) {
	var rp, rs, rb []byte
	var epoch int
	err := s.st.db.QueryRow(`SELECT rec_pkg,rec_sign_pub,rec_box_pub,epoch FROM accounts WHERE id=?`, se.acct).Scan(&rp, &rs, &rb, &epoch)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	var pkg []byte
	_ = s.st.db.QueryRow(`SELECT pkg FROM devices WHERE account_id=? AND id=?`, se.acct, se.device).Scan(&pkg)
	writeJSON(w, 200, map[string]any{"recovery": RecoveryInfo{SignPub: rs, BoxPub: rb, Pkg: rp}, "epoch": epoch, "pkg": pkg})
}

func (s *Server) hPasswordStart(w http.ResponseWriter, r *http.Request, se sess) {
	var in struct {
		Request []byte `json:"request"`
	}
	if !decode(w, r, &in) {
		return
	}
	req, err := s.op.Deserialize.RegistrationRequest(in.Request)
	if err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	cred := opaque.RandomBytes(64)
	resp, err := s.op.RegistrationResponse(req, cred, nil)
	if err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	id := randID()
	s.mu.Lock()
	s.gcPending()
	if len(s.regs) >= pendingCap {
		s.mu.Unlock()
		writeErr(w, 429, "busy")
		return
	}
	s.regs[id] = &pendingReg{cred: cred, exp: s.now().Add(2 * time.Minute), pw: true, acct: se.acct}
	s.mu.Unlock()
	writeJSON(w, 200, map[string]any{"reg_id": id, "response": resp.Serialize()})
}

func (s *Server) hPasswordFinish(w http.ResponseWriter, r *http.Request, se sess) {
	var in struct {
		RegID  string `json:"reg_id"`
		Record []byte `json:"record"`
	}
	if !decode(w, r, &in) {
		return
	}
	p := s.takeReg(in.RegID, true)
	if p == nil || p.acct != se.acct {
		writeErr(w, 400, "bad_request")
		return
	}
	if _, err := s.op.Deserialize.RegistrationRecord(in.Record); err != nil {
		writeErr(w, 400, "bad_request")
		return
	}
	tx, err := s.st.db.Begin()
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer tx.Rollback()
	// Replace credential + wrap in one transaction; drop every other session.
	if _, err := tx.Exec(`UPDATE accounts SET cred_id=?, opaque_record=? WHERE id=?`, p.cred, in.Record, se.acct); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if _, err := tx.Exec(`DELETE FROM sessions WHERE account_id=? AND NOT (device_id=? )`, se.acct, se.device); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) hRecoveryRotate(w http.ResponseWriter, r *http.Request, se sess) {
	var in RecoveryInfo
	if !decode(w, r, &in) {
		return
	}
	if !in.valid() {
		writeErr(w, 400, "bad_request")
		return
	}
	if _, err := s.st.db.Exec(`UPDATE accounts SET rec_sign_pub=?, rec_box_pub=?, rec_pkg=? WHERE id=?`, in.SignPub, in.BoxPub, in.Pkg, se.acct); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (s *Server) hDeleteAccount(w http.ResponseWriter, r *http.Request, se sess) {
	if _, err := s.st.db.Exec(`DELETE FROM accounts WHERE id=?`, se.acct); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

func (s *Server) hStats(w http.ResponseWriter, r *http.Request, se sess) {
	var used int64
	var cnt, seq int
	_ = s.st.db.QueryRow(`SELECT used_bytes,rec_count,seq FROM accounts WHERE id=?`, se.acct).Scan(&used, &cnt, &seq)
	writeJSON(w, 200, map[string]any{"used_bytes": used, "quota_bytes": s.quotaFor(se.acct), "records": cnt, "head_seq": seq})
}

// ---------- records ----------

// WireRecord is a record as exchanged with clients.
type WireRecord struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
	Epoch      int    `json:"epoch"`
	Blob       []byte `json:"blob"`
	Deleted    bool   `json:"deleted"`
	BaseSeq    int64  `json:"base_seq,omitempty"` // push only
	Seq        int64  `json:"seq,omitempty"`      // pull only
}

type pushResult struct {
	ID         string `json:"id"`
	Collection string `json:"collection"`
	Status     string `json:"status"` // ok | conflict | rejected
	Seq        int64  `json:"seq,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

func (s *Server) hPush(w http.ResponseWriter, r *http.Request, se sess) {
	var in struct {
		Records []WireRecord `json:"records"`
	}
	if !decode(w, r, &in) {
		return
	}
	if len(in.Records) == 0 || len(in.Records) > s.cfg.MaxBatch {
		writeErr(w, 400, "bad_batch")
		return
	}
	tx, err := s.st.db.Begin()
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer tx.Rollback()
	var seq, used, quota int64
	var cnt, epoch int
	if err := tx.QueryRow(`SELECT seq,used_bytes,rec_count,epoch,quota_bytes FROM accounts WHERE id=?`, se.acct).Scan(&seq, &used, &cnt, &epoch, &quota); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if quota == 0 {
		quota = s.cfg.QuotaBytes
	}
	now := s.now().Unix()
	results := make([]pushResult, 0, len(in.Records))
	for _, rec := range in.Records {
		res := pushResult{ID: rec.ID, Collection: rec.Collection}
		rej := func(why string) { res.Status, res.Reason = "rejected", why; results = append(results, res) }
		switch {
		case !collections[rec.Collection]:
			rej("collection")
			continue
		case !reRid.MatchString(rec.ID):
			rej("id")
			continue
		case rec.Epoch < 0 || rec.Epoch > epoch:
			rej("epoch")
			continue
		case len(rec.Blob) == 0 || len(rec.Blob) > s.cfg.MaxRecordBytes:
			rej("size")
			continue
		}
		var oldSeq int64
		var oldLen int64
		err := tx.QueryRow(`SELECT seq, length(blob) FROM records WHERE account_id=? AND collection=? AND rid=?`, se.acct, rec.Collection, rec.ID).Scan(&oldSeq, &oldLen)
		exists := err == nil
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			writeErr(w, 500, "internal")
			return
		}
		if exists && rec.BaseSeq != oldSeq {
			res.Status, res.Seq = "conflict", oldSeq
			results = append(results, res)
			continue
		}
		if !exists && rec.BaseSeq != 0 {
			res.Status, res.Seq = "conflict", 0
			results = append(results, res)
			continue
		}
		delta := int64(len(rec.Blob)) - oldLen
		if !exists {
			if cnt+1 > s.cfg.MaxRecords {
				rej("record_limit")
				continue
			}
		}
		if used+delta > quota {
			rej("quota")
			continue
		}
		seq++
		del := 0
		if rec.Deleted {
			del = 1
		}
		if exists {
			_, err = tx.Exec(`UPDATE records SET epoch=?,blob=?,deleted=?,seq=?,updated_at=? WHERE account_id=? AND collection=? AND rid=?`,
				rec.Epoch, rec.Blob, del, seq, now, se.acct, rec.Collection, rec.ID)
		} else {
			_, err = tx.Exec(`INSERT INTO records(account_id,collection,rid,epoch,blob,deleted,seq,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
				se.acct, rec.Collection, rec.ID, rec.Epoch, rec.Blob, del, seq, now)
			cnt++
		}
		if err != nil {
			writeErr(w, 500, "internal")
			return
		}
		used += delta
		res.Status, res.Seq = "ok", seq
		results = append(results, res)
	}
	if _, err := tx.Exec(`UPDATE accounts SET seq=?, used_bytes=?, rec_count=? WHERE id=?`, seq, used, cnt, se.acct); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, 500, "internal")
		return
	}
	writeJSON(w, 200, map[string]any{"results": results, "head_seq": seq})
}

func (s *Server) hPull(w http.ResponseWriter, r *http.Request, se sess) {
	q := r.URL.Query()
	var since int64
	if v := q.Get("since"); v != "" {
		if _, err := fmt.Sscanf(v, "%d", &since); err != nil || since < 0 {
			writeErr(w, 400, "bad_since")
			return
		}
	}
	limit := 200
	if v := q.Get("limit"); v != "" {
		if _, err := fmt.Sscanf(v, "%d", &limit); err != nil || limit < 1 || limit > 500 {
			writeErr(w, 400, "bad_limit")
			return
		}
	}
	col := q.Get("collection")
	if col != "" && !collections[col] {
		writeErr(w, 400, "bad_collection")
		return
	}
	var compacted, head int64
	_ = s.st.db.QueryRow(`SELECT compacted_before,seq FROM accounts WHERE id=?`, se.acct).Scan(&compacted, &head)
	if since > head {
		writeErr(w, 409, "cursor_ahead") // server rolled back or bogus cursor; client should report
		return
	}
	if since != 0 && since < compacted {
		writeErr(w, 410, "resync_required")
		return
	}
	rows, err := s.st.db.Query(`SELECT collection,rid,epoch,blob,deleted,seq FROM records
WHERE account_id=? AND seq>? AND (?='' OR collection=?) ORDER BY seq LIMIT ?`, se.acct, since, col, col, limit+1)
	if err != nil {
		writeErr(w, 500, "internal")
		return
	}
	defer rows.Close()
	out := []WireRecord{}
	more := false
	for rows.Next() {
		var wr WireRecord
		var del int
		if err := rows.Scan(&wr.Collection, &wr.ID, &wr.Epoch, &wr.Blob, &del, &wr.Seq); err != nil {
			continue
		}
		if len(out) == limit {
			more = true
			break
		}
		wr.Deleted = del == 1
		out = append(out, wr)
	}
	next := since
	if len(out) > 0 {
		next = out[len(out)-1].Seq
	}
	if !more {
		next = max(next, head)
		if col != "" {
			next = max(since, head)
		}
	}
	writeJSON(w, 200, map[string]any{"records": out, "next_seq": next, "more": more, "head_seq": head, "compacted_before": compacted})
}

// Compact purges tombstones older than the retention window and advances the
// per-account watermark so stale clients are told to resync.
func (s *Server) Compact() (int64, error) {
	cutoff := s.now().Add(-s.cfg.TombstoneKeep).Unix()
	tx, err := s.st.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := tx.Query(`SELECT account_id, MAX(seq) FROM records WHERE deleted=1 AND updated_at<? GROUP BY account_id`, cutoff)
	if err != nil {
		return 0, err
	}
	type aw struct{ a, m int64 }
	var ws []aw
	for rows.Next() {
		var x aw
		_ = rows.Scan(&x.a, &x.m)
		ws = append(ws, x)
	}
	rows.Close()
	var total int64
	for _, x := range ws {
		res, err := tx.Exec(`DELETE FROM records WHERE account_id=? AND deleted=1 AND updated_at<?`, x.a, cutoff)
		if err != nil {
			return 0, err
		}
		n, _ := res.RowsAffected()
		total += n
		if _, err := tx.Exec(`UPDATE accounts SET compacted_before=MAX(compacted_before,?), rec_count=rec_count-?, used_bytes=(SELECT COALESCE(SUM(length(blob)),0) FROM records WHERE account_id=?) WHERE id=?`, x.m, n, x.a, x.a); err != nil {
			return 0, err
		}
	}
	_, _ = tx.Exec(`DELETE FROM sessions WHERE expires_at<?`, s.now().Unix())
	return total, tx.Commit()
}
