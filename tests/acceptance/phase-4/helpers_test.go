package phase4

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	sc "corvid/syncclient"
	"corvid/syncserver/syncserver"
)

const regToken = "invite-123"

type env struct {
	t      *testing.T
	dir    string
	srv    *syncserver.Server
	ts     *httptest.Server
	cfg    syncserver.Config
	counts sync.Map // "METHOD path" -> *int64
}

func (e *env) count(key string) int64 {
	v, ok := e.counts.Load(key)
	if !ok {
		return 0
	}
	return atomic.LoadInt64(v.(*int64))
}

// newEnv starts a real server (SQLite on disk) behind httptest. wrap lets a test
// play a malicious/faulty network or server in front of the real handler.
func newEnv(t *testing.T, mod func(*syncserver.Config), wrap func(http.Handler) http.Handler) *env {
	t.Helper()
	dir := t.TempDir()
	cfg := syncserver.Config{
		DBPath: filepath.Join(dir, "sync.db"), KeyFile: filepath.Join(dir, "keys.json"),
		Registration: syncserver.RegToken, RegToken: regToken,
		GeneralPerMin: 1_000_000, AuthPerMin: 1_000_000, LoginFailLimit: 1000,
	}
	if mod != nil {
		mod(&cfg)
	}
	srv, err := syncserver.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, dir: dir, srv: srv, cfg: cfg}
	var h http.Handler = srv
	count := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		k := r.Method + " " + r.URL.Path
		v, _ := e.counts.LoadOrStore(k, new(int64))
		atomic.AddInt64(v.(*int64), 1)
		srv.ServeHTTP(w, r)
	})
	h = count
	if wrap != nil {
		h = wrap(h)
	}
	e.ts = httptest.NewServer(h)
	t.Cleanup(func() { e.ts.Close(); srv.Close() })
	return e
}

func ctx() context.Context { return context.Background() }

type device struct {
	acct *sc.Account
	eng  *sc.Engine
	name string
}

func (e *env) newEngine(a *sc.Account) *sc.Engine {
	eng, err := sc.NewEngine(a, &sc.MemLocalStore{}, nil)
	if err != nil {
		e.t.Fatal(err)
	}
	return eng
}

func (e *env) register(user, pass, devName string) (*device, sc.RecoveryKey) {
	e.t.Helper()
	a, rk, err := sc.Register(ctx(), e.ts.URL, user, pass, regToken, devName, &sc.MemStateStore{}, nil)
	if err != nil {
		e.t.Fatalf("register: %v", err)
	}
	return &device{acct: a, eng: e.newEngine(a), name: devName}, rk
}

// enroll logs a brand-new device in and has `approver` approve it.
func (e *env) enroll(approver *device, user, pass, devName string) *device {
	e.t.Helper()
	a, err := sc.Login(ctx(), e.ts.URL, user, pass, devName, &sc.MemStateStore{}, nil)
	if err != nil {
		e.t.Fatalf("login new device: %v", err)
	}
	if a.Approved() {
		e.t.Fatal("new device must start pending")
	}
	devs, err := approver.acct.Devices(ctx())
	if err != nil {
		e.t.Fatal(err)
	}
	for _, d := range devs {
		if d.State == "pending" && d.Name == devName {
			if err := approver.acct.ApproveDevice(ctx(), d.ID, d.Fingerprint); err != nil {
				e.t.Fatalf("approve: %v", err)
			}
		}
	}
	if err := a.Poll(ctx()); err != nil {
		e.t.Fatal(err)
	}
	if !a.Approved() {
		e.t.Fatal("device not approved after approval")
	}
	return &device{acct: a, eng: e.newEngine(a), name: devName}
}

func (d *device) sync(t *testing.T) sc.Report {
	t.Helper()
	r, err := d.eng.Sync(ctx())
	if err != nil {
		t.Fatalf("sync %s: %v", d.name, err)
	}
	if len(r.Integrity) > 0 {
		t.Fatalf("sync %s: unexpected integrity errors %v", d.name, r.Integrity)
	}
	return r
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func readAll(t *testing.T, dir string) map[string][]byte {
	t.Helper()
	out := map[string][]byte{}
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		b, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err == nil {
			out[e.Name()] = b
		}
	}
	return out
}

// fakeClock is an injectable server clock.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock { return &fakeClock{t: time.Unix(1_800_000_000, 0)} }
func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *fakeClock) Advance(d time.Duration) { c.mu.Lock(); c.t = c.t.Add(d); c.mu.Unlock() }
