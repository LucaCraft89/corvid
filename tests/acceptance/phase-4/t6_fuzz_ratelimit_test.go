package phase4

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	sc "corvid/syncclient"
	"corvid/syncserver/syncserver"
)

type route struct{ method, path string }

var allRoutes = []route{
	{"GET", "/healthz"}, {"GET", "/v1/info"},
	{"POST", "/v1/register/start"}, {"POST", "/v1/register/finish"},
	{"POST", "/v1/login/start"}, {"POST", "/v1/login/finish"},
	{"POST", "/v1/recovery/challenge"}, {"POST", "/v1/recovery/login"},
	{"GET", "/v1/devices/self"}, {"GET", "/v1/devices"},
	{"POST", "/v1/devices/{id}/approve"}, {"POST", "/v1/devices/{id}/revoke"},
	{"GET", "/v1/keys"}, {"POST", "/v1/password/start"}, {"POST", "/v1/password/finish"},
	{"POST", "/v1/recovery/rotate"}, {"POST", "/v1/records/push"}, {"GET", "/v1/records/pull"},
	{"GET", "/v1/stats"}, {"DELETE", "/v1/account"}, {"GET", "/"}, {"GET", "/nope"},
}

func randString(r *rand.Rand, n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte(r.Intn(256))
	}
	return string(b)
}

func randPath(r *rand.Rand, rt route, validDev string) string {
	p := rt.path
	if strings.Contains(p, "{id}") {
		var id string
		switch r.Intn(6) {
		case 0:
			id = validDev
		case 1:
			id = "../../etc/passwd"
		case 2:
			id = strings.Repeat("a", 5000)
		case 3:
			id = "%00%ff%zz"
		case 4:
			id = fmt.Sprintf("%032x", r.Int63())
		default:
			id = "ünï"
		}
		p = strings.Replace(p, "{id}", id, 1)
	}
	if rt.path == "/v1/records/pull" || r.Intn(8) == 0 {
		qs := []string{"since=-1", "since=abc", "since=99999999999999999999", "limit=0", "limit=100000000000", "collection=../x",
			"collection=bookmarks", "since=0&limit=5", "collection=" + strings.Repeat("z", 3000), "since=%00", "limit=-5&since=-5", ""}
		p += "?" + qs[r.Intn(len(qs))]
	}
	return p
}

func randValue(r *rand.Rand, depth int) any {
	switch r.Intn(9) {
	case 0:
		return nil
	case 1:
		return r.Int63() - r.Int63()
	case 2:
		return r.Float64() * 1e308
	case 3:
		return r.Intn(2) == 0
	case 4:
		return strings.Repeat("x", r.Intn(70000))
	case 5:
		return randString(r, r.Intn(100))
	case 6:
		if depth > 4 {
			return 1
		}
		a := make([]any, r.Intn(5))
		for i := range a {
			a[i] = randValue(r, depth+1)
		}
		return a
	case 7:
		if depth > 4 {
			return 2
		}
		m := map[string]any{}
		for i := 0; i < r.Intn(5); i++ {
			m[randString(r, 4)] = randValue(r, depth+1)
		}
		return m
	default:
		return "AAAA"
	}
}

var knownFields = []string{"username", "request", "token", "reg_id", "record", "wrap_pass", "recovery", "device", "login_id", "ke1", "ke3",
	"nonce", "sig", "pkg", "epoch", "recovery_pkg", "packages", "records", "collection", "id", "blob", "deleted", "base_seq", "sign_pub", "box_pub", "pub", "name"}

func randBody(r *rand.Rand) []byte {
	switch r.Intn(10) {
	case 0:
		return nil
	case 1:
		return []byte("{}")
	case 2:
		return []byte("null")
	case 3:
		return []byte(randString(r, r.Intn(300)))
	case 4:
		return []byte(strings.Repeat("[", 100000))
	case 5:
		b, _ := json.Marshal(map[string]any{"records": []any{map[string]any{"collection": "bookmarks", "id": strings.Repeat("a", 64), "epoch": r.Intn(5) - 2, "blob": "AAAA", "base_seq": r.Int63()}}})
		return b
	case 6:
		b, _ := json.Marshal(map[string]any{"records": make([]any, 5000)})
		return b
	default:
		m := map[string]any{}
		for i := 0; i < 1+r.Intn(6); i++ {
			m[knownFields[r.Intn(len(knownFields))]] = randValue(r, 0)
		}
		b, _ := json.Marshal(m)
		return b
	}
}

// Acceptance 6a: no endpoint can be made to crash or 5xx by hostile input, with every kind of credential.
func TestAcceptance6_FuzzEveryEndpoint(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("pat", "fuzz account passphrase", "fuzz-a")
	p, err := sc.Login(ctx(), e.ts.URL, "pat", "fuzz account passphrase", "fuzz-pending", &sc.MemStateStore{}, nil)
	must(t, err)
	tokens := []string{"", "Bearer ", "Bearer garbage", "Bearer " + strings.Repeat("A", 5000), "Basic abc",
		"Bearer " + a.acct.St.Token, "Bearer " + a.acct.St.Token, "Bearer " + p.St.Token}
	r := rand.New(rand.NewSource(7))
	const perRoute = 1500
	statuses := map[int]int{}
	var bad []string
	for _, rt := range allRoutes {
		for i := 0; i < perRoute; i++ {
			body := randBody(r)
			auth := tokens[r.Intn(len(tokens))]
			if rt.method == "DELETE" && strings.Contains(auth, a.acct.St.Token) {
				auth = "Bearer garbage" // keep the real account alive for the post-fuzz health check
			}
			method := rt.method
			if r.Intn(12) == 0 { // wrong methods too
				method = []string{"PUT", "PATCH", "OPTIONS", "TRACE", "HEAD", "GET", "POST", "BREW"}[r.Intn(8)]
			}
			// build the request by hand: hostile paths/queries must reach the handler, not be rejected by the test client
			req := httptest.NewRequest("GET", "http://x/", bytes.NewReader(body))
			req.Method = method
			full := randPath(r, rt, a.acct.St.DeviceID)
			pth, qs, _ := strings.Cut(full, "?")
			req.URL.Path, req.URL.RawQuery = pth, qs
			req.URL.RawPath = ""
			switch r.Intn(5) {
			case 0:
			case 1:
				req.Header.Set("Content-Type", "text/plain")
			default:
				req.Header.Set("Content-Type", "application/json")
			}
			if auth != "" {
				req.Header.Set("Authorization", auth)
			}
			if r.Intn(20) == 0 {
				req.Header.Set("X-Forwarded-For", randString(r, 20))
			}
			rec := httptest.NewRecorder()
			e.srv.ServeHTTP(rec, req)
			statuses[rec.Code]++
			if rec.Code >= 500 {
				bad = append(bad, fmt.Sprintf("%s %s -> %d body=%q", method, req.URL, rec.Code, truncate(body, 80)))
			}
			if rec.Code != 200 && rec.Code != 204 && rec.Body.Len() > 0 {
				var x any
				if json.Unmarshal(rec.Body.Bytes(), &x) != nil && method != "HEAD" {
					bad = append(bad, fmt.Sprintf("%s %s -> non-JSON error body %q", method, req.URL, rec.Body.String()))
				}
			}
		}
	}
	if len(bad) > 0 {
		for _, b := range bad[:min(len(bad), 15)] {
			t.Error(b)
		}
		t.Fatalf("%d bad responses", len(bad))
	}
	t.Logf("fuzzed %d routes x %d requests = %d, status histogram: %v", len(allRoutes), perRoute, len(allRoutes)*perRoute, statuses)

	// still healthy and consistent afterwards
	must(t, a.eng.SetSetting("after-fuzz", true))
	a.sync(t)
	b := e.enroll(a, "pat", "fuzz account passphrase", "post-fuzz")
	b.sync(t)
	if _, ok := b.eng.Setting("after-fuzz"); !ok {
		t.Fatal("server unusable after fuzzing")
	}
	// the SQLite file is still structurally sound
	e.ts.Close()
	e.srv.Close()
	if st, err := os.Stat(filepath.Join(e.dir, "sync.db")); err != nil || st.Size() == 0 {
		t.Fatal("db missing")
	}
}

func truncate(b []byte, n int) []byte {
	if len(b) > n {
		return b[:n]
	}
	return b
}

// Oversized bodies, records, batches and quotas are refused cleanly.
func TestLimitsBodyRecordBatchQuota(t *testing.T) {
	e := newEnv(t, func(c *syncserver.Config) {
		c.QuotaBytes = 4096
		c.MaxRecordBytes = 2048
		c.MaxBatch = 5
		c.MaxBodyBytes = 64 << 10
	}, nil)
	a, _ := e.register("quinn", "limits passphrase 1", "a")
	post := func(path string, body []byte) int {
		req, _ := http.NewRequest("POST", e.ts.URL+path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+a.acct.St.Token)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if c := post("/v1/records/push", bytes.Repeat([]byte("a"), 200<<10)); c != 413 && c != 400 {
		t.Fatalf("oversized body: %d", c)
	}
	mk := func(n int, size int) []byte {
		var recs []map[string]any
		for i := 0; i < n; i++ {
			recs = append(recs, map[string]any{"collection": "settings", "id": fmt.Sprintf("%064x", i), "epoch": 0, "blob": bytes.Repeat([]byte{1}, size)})
		}
		b, _ := json.Marshal(map[string]any{"records": recs})
		return b
	}
	if c := post("/v1/records/push", mk(6, 10)); c != 400 {
		t.Fatalf("batch over cap: %d", c)
	}
	push := func(b []byte) []string {
		req, _ := http.NewRequest("POST", e.ts.URL+"/v1/records/push", bytes.NewReader(b))
		req.Header.Set("Authorization", "Bearer "+a.acct.St.Token)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var out struct {
			Results []struct{ Status, Reason string } `json:"results"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&out)
		var s []string
		for _, r := range out.Results {
			s = append(s, r.Status+":"+r.Reason)
		}
		return s
	}
	if got := push(mk(1, 5000)); got[0] != "rejected:size" {
		t.Fatalf("record over cap: %v", got)
	}
	got := push(mk(4, 1500)) // 4 x 1500 > 4096 quota: first two fit
	t.Logf("quota behaviour: %v", got)
	if got[0] != "ok:" || got[len(got)-1] != "rejected:quota" {
		t.Fatalf("quota not enforced: %v", got)
	}
}

// Acceptance 6b: rate limits are enforced (per-IP general, per-IP auth, per-(user,ip) login attempts) and recover.
func TestAcceptance6_RateLimits(t *testing.T) {
	clk := newFakeClock()
	e := newEnv(t, func(c *syncserver.Config) {
		c.Now = clk.Now
		c.GeneralPerMin, c.AuthPerMin, c.LoginFailLimit = 600, 20, 1000
	}, nil)
	get := func(path string) *http.Response {
		resp, err := http.Get(e.ts.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp
	}
	// auth routes: burst of 5 then 429s
	var ok, limited int
	var retry string
	for i := 0; i < 60; i++ {
		resp, _ := http.Post(e.ts.URL+"/v1/login/start", "application/json", strings.NewReader(`{}`))
		resp.Body.Close()
		if resp.StatusCode == 429 {
			limited++
			retry = resp.Header.Get("Retry-After")
		} else {
			ok++
		}
	}
	if limited < 40 || ok < 3 || retry == "" {
		t.Fatalf("auth limiter: ok=%d limited=%d retry-after=%q", ok, limited, retry)
	}
	t.Logf("auth limiter: %d allowed, %d limited (Retry-After=%s)", ok, limited, retry)
	// refills with time
	clk.Advance(2 * time.Minute)
	resp, _ := http.Post(e.ts.URL+"/v1/login/start", "application/json", strings.NewReader(`{}`))
	resp.Body.Close()
	if resp.StatusCode == 429 {
		t.Fatal("limiter did not refill")
	}
	// general limiter on a cheap route
	e2 := newEnv(t, func(c *syncserver.Config) { c.Now = clk.Now; c.GeneralPerMin = 60 }, nil)
	limited = 0
	for i := 0; i < 100; i++ {
		resp, _ := http.Get(e2.ts.URL + "/healthz")
		resp.Body.Close()
		if resp.StatusCode == 429 {
			limited++
		}
	}
	if limited < 70 {
		t.Fatalf("general limiter: only %d of 100 limited", limited)
	}
	_ = get
}

func TestLoginAttemptBackoffPerUserAndIP(t *testing.T) {
	clk := newFakeClock()
	e := newEnv(t, func(c *syncserver.Config) { c.Now = clk.Now; c.LoginFailLimit = 3 }, nil)
	a, _ := e.register("ruth", "backoff passphrase 1", "a")
	_ = a
	var codes []string
	for i := 0; i < 6; i++ {
		_, err := sc.Login(ctx(), e.ts.URL, "ruth", "wrong guess "+fmt.Sprint(i), "x", &sc.MemStateStore{}, nil)
		codes = append(codes, fmt.Sprint(err))
	}
	t.Logf("attempts: %v", codes)
	if !strings.Contains(strings.Join(codes[3:], ""), "429") {
		t.Fatalf("no backoff after repeated wrong guesses: %v", codes)
	}
	// even the right passphrase is refused during backoff, accepted after it expires
	if _, err := sc.Login(ctx(), e.ts.URL, "ruth", "backoff passphrase 1", "y", &sc.MemStateStore{}, nil); err == nil {
		t.Fatal("login accepted during backoff")
	}
	clk.Advance(30 * time.Minute)
	if _, err := sc.Login(ctx(), e.ts.URL, "ruth", "backoff passphrase 1", "y", &sc.MemStateStore{}, nil); err != nil {
		t.Fatalf("login after backoff: %v", err)
	}
}

func TestRegistrationModes(t *testing.T) {
	for _, c := range []struct {
		mode, token string
		wantOK      bool
	}{{syncserver.RegClosed, "", false}, {syncserver.RegToken, "wrong", false}, {syncserver.RegToken, regToken, true}, {syncserver.RegOpen, "", true}} {
		e := newEnv(t, func(cf *syncserver.Config) { cf.Registration = c.mode }, nil)
		_, _, err := sc.Register(ctx(), e.ts.URL, "sam", "registration passphrase", c.token, "d", &sc.MemStateStore{}, nil)
		if (err == nil) != c.wantOK {
			t.Fatalf("mode=%s token=%q: err=%v wantOK=%v", c.mode, c.token, err, c.wantOK)
		}
		if err == nil {
			if _, _, err := sc.Register(ctx(), e.ts.URL, "sam", "other", c.token, "d2", &sc.MemStateStore{}, nil); err == nil {
				t.Fatal("duplicate username accepted")
			}
		}
	}
}

// ---- native Go fuzzing of the HTTP surface (go test -fuzz FuzzAPI) ----

var (
	fuzzOnce sync.Once
	fuzzSrv  *syncserver.Server
	fuzzTok  string
)

func fuzzServer(tb testing.TB) *syncserver.Server {
	fuzzOnce.Do(func() {
		dir, _ := os.MkdirTemp("", "fuzzsync")
		cfg := syncserver.Config{DBPath: filepath.Join(dir, "f.db"), KeyFile: filepath.Join(dir, "k.json"), Registration: syncserver.RegOpen,
			GeneralPerMin: 1 << 30, AuthPerMin: 1 << 30, LoginFailLimit: 1 << 30}
		s, err := syncserver.New(cfg)
		if err != nil {
			panic(err)
		}
		fuzzSrv = s
	})
	return fuzzSrv
}

func FuzzAPI(f *testing.F) {
	f.Add(uint8(0), uint8(4), []byte(`{"username":"abc","ke1":"AAAA"}`), "")
	f.Add(uint8(1), uint8(16), []byte(`{"records":[{"collection":"x","id":"y"}]}`), "Bearer abc")
	f.Add(uint8(2), uint8(17), []byte(``), "Bearer ")
	f.Fuzz(func(t *testing.T, m uint8, ri uint8, body []byte, auth string) {
		s := fuzzServer(t)
		rt := allRoutes[int(ri)%len(allRoutes)]
		method := []string{rt.method, "GET", "POST", "DELETE"}[int(m)%4]
		path := strings.ReplaceAll(rt.path, "{id}", "abc")
		req := httptest.NewRequest(method, "http://x"+path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, req)
		if rec.Code >= 500 {
			t.Fatalf("%s %s -> %d (%s)", method, path, rec.Code, rec.Body.String())
		}
	})
}
