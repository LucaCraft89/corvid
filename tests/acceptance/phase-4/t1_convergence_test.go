package phase4

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	sc "corvid/syncclient"
	"corvid/syncserver/syncserver"
)

func snapshot(d *device) map[string]string {
	out := map[string]string{}
	for _, c := range sc.AllCollections {
		for _, r := range d.eng.List(c) {
			out[c+"/"+r.ID] = string(r.Data)
		}
	}
	out["TREE"] = strings.Join(d.eng.BookmarkTree().Flatten(""), "\n")
	return out
}

func assertEqual(t *testing.T, a, b *device) {
	t.Helper()
	sa, sb := snapshot(a), snapshot(b)
	if !reflect.DeepEqual(sa, sb) {
		ja, _ := json.MarshalIndent(sa, "", " ")
		jb, _ := json.MarshalIndent(sb, "", " ")
		t.Fatalf("devices diverged\n%s:\n%s\n%s:\n%s", a.name, ja, b.name, jb)
	}
}

// Acceptance 1: two clients (simulated Linux + Windows) converge after edits made offline on both sides.
func TestAcceptance1_TwoClientsConvergeAfterOfflineEdits(t *testing.T) {
	e := newEnv(t, nil, nil)
	lin, _ := e.register("alice", "correct horse battery staple", "linux-desktop")
	win := e.enroll(lin, "alice", "correct horse battery staple", "windows-laptop")

	// shared starting state
	must(t, lin.eng.PutBookmark("f-news", sc.Bookmark{Kind: "folder", Title: "News", Parent: sc.BMToolbar, Index: "a"}))
	must(t, lin.eng.PutBookmark("b-1", sc.Bookmark{Kind: "url", Title: "Example", URL: "https://example.org/", Parent: "f-news", Index: "a"}))
	must(t, lin.eng.SetSetting("theme.seed", "#336699"))
	must(t, lin.eng.Put(sc.Passwords, "pw-1", sc.PasswordItem{Origin: "https://example.org", Username: "al", Password: "hunter2"}))
	lin.sync(t)
	win.sync(t)
	assertEqual(t, lin, win)
	if len(win.eng.List(sc.Bookmarks)) != 2 {
		t.Fatal("initial sync did not deliver bookmarks")
	}

	// both go offline (no Sync calls) and edit, including the SAME record and conflicting deletes
	must(t, lin.eng.PutBookmark("b-lin", sc.Bookmark{Kind: "url", Title: "Linux only", URL: "https://l.example/", Parent: "f-news", Index: "b"}))
	must(t, lin.eng.SetSetting("sidebar.side", "left"))
	must(t, lin.eng.SetSetting("shared.key", "from-linux"))
	must(t, lin.eng.Put(sc.Passwords, "pw-2", sc.PasswordItem{Origin: "https://l.example", Username: "u", Password: "pl"}))
	must(t, lin.eng.PutBookmark("b-1", sc.Bookmark{Kind: "url", Title: "Example (renamed on linux)", URL: "https://example.org/", Parent: "f-news", Index: "a"}))

	time.Sleep(5 * time.Millisecond) // make the wall-clock order of the two offline edits unambiguous
	must(t, win.eng.PutBookmark("b-win", sc.Bookmark{Kind: "url", Title: "Windows only", URL: "https://w.example/", Parent: "f-news", Index: "c"}))
	must(t, win.eng.SetSetting("tabs.vertical", true))
	must(t, win.eng.SetSetting("shared.key", "from-windows")) // later wall clock than linux's edit
	must(t, win.eng.DeleteBookmark("f-news"))                 // folder deleted while linux added children
	if lin.eng.Pending() == 0 || win.eng.Pending() == 0 {
		t.Fatal("offline edits must be queued")
	}

	// reconnect in an arbitrary order; two rounds is enough for pairwise convergence
	win.sync(t)
	lin.sync(t)
	win.sync(t)
	lin.sync(t)
	assertEqual(t, lin, win)
	if lin.eng.Pending() != 0 || win.eng.Pending() != 0 {
		t.Fatal("queues must drain")
	}
	if v, _ := lin.eng.Setting("shared.key"); string(v) != `"from-windows"` {
		t.Fatalf("LWW: expected later write to win, got %s", v)
	}
	if _, ok := lin.eng.Setting("sidebar.side"); !ok {
		t.Fatal("per-key settings merge lost a key")
	}
	if _, ok := win.eng.Setting("tabs.vertical"); !ok {
		t.Fatal("per-key settings merge lost a key")
	}
	tree := strings.Join(lin.eng.BookmarkTree().Flatten(""), "\n")
	// the folder is gone; its surviving children are re-homed under "unsorted", none lost
	for _, want := range []string{"Windows only", "Linux only", "renamed on linux"} {
		if !strings.Contains(tree, want) {
			t.Fatalf("bookmark %q lost in merge:\n%s", want, tree)
		}
	}
	if !strings.Contains(tree, "/unsorted/") {
		t.Fatalf("orphans should be re-homed to unsorted:\n%s", tree)
	}
	t.Logf("converged tree:\n%s", tree)
}

func TestOfflineQueueSurvivesRestartAndNetworkFailure(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("bob", "pass phrase one", "dev-a")
	dir := t.TempDir()
	st := sc.FileLocalStore{Path: filepath.Join(dir, "local.json")}
	eng, err := sc.NewEngine(a.acct, st, nil)
	must(t, err)
	must(t, eng.SetSetting("k", 1))
	must(t, eng.Put(sc.Passwords, "p", sc.PasswordItem{Origin: "o", Username: "u", Password: "x"}))
	// server goes away: Sync fails, queue intact
	e.ts.Close()
	if _, err := eng.Sync(ctx()); err == nil {
		t.Fatal("expected network error")
	}
	if eng.Pending() != 2 {
		t.Fatalf("queue lost on failure: %d", eng.Pending())
	}
	// "restart" the client
	eng2, err := sc.NewEngine(a.acct, st, nil)
	must(t, err)
	if eng2.Pending() != 2 {
		t.Fatalf("queue not persisted across restart: %d", eng2.Pending())
	}
}

// Randomised convergence: 3 devices, random ops, random sync order, then settle.
func TestRandomisedConvergence(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("carol", "a long passphrase here", "d0")
	b := e.enroll(a, "carol", "a long passphrase here", "d1")
	c := e.enroll(a, "carol", "a long passphrase here", "d2")
	devs := []*device{a, b, c}
	rng := rand.New(rand.NewSource(42))
	folders := []string{"f0", "f1", "f2", "f3"}
	ids := []string{}
	for i := 0; i < 400; i++ {
		d := devs[rng.Intn(3)]
		switch op := rng.Intn(10); {
		case op < 3: // new / edit bookmark
			id := fmt.Sprintf("b%d", rng.Intn(25))
			ids = append(ids, id)
			par := append([]string{sc.BMToolbar, sc.BMOther}, folders...)[rng.Intn(6)]
			must(t, d.eng.PutBookmark(id, sc.Bookmark{Kind: "url", Title: fmt.Sprintf("t%d", rng.Intn(1e6)), URL: "https://x/" + id, Parent: par, Index: sc.IndexBetween("", fmt.Sprintf("%c", 'b'+rng.Intn(20)))}))
		case op < 5: // folder create / move (may form cycles)
			f := folders[rng.Intn(4)]
			par := append([]string{sc.BMToolbar}, folders...)[rng.Intn(5)]
			must(t, d.eng.PutBookmark(f, sc.Bookmark{Kind: "folder", Title: f, Parent: par, Index: "m"}))
		case op < 6:
			must(t, d.eng.DeleteBookmark(folders[rng.Intn(4)]))
		case op < 7 && len(ids) > 0:
			must(t, d.eng.DeleteBookmark(ids[rng.Intn(len(ids))]))
		case op < 9:
			must(t, d.eng.SetSetting(fmt.Sprintf("s%d", rng.Intn(6)), rng.Intn(100)))
		default: // sync a random device mid-way
			devs[rng.Intn(3)].sync(t)
		}
	}
	for round := 0; round < 3; round++ {
		for _, d := range devs {
			d.sync(t)
		}
	}
	assertEqual(t, a, b)
	assertEqual(t, b, c)
	// the tree must be acyclic and contain every live node exactly once
	var seen = map[string]int{}
	var walk func(n *sc.BMNode, depth int)
	walk = func(n *sc.BMNode, depth int) {
		if depth > 50 {
			t.Fatal("cycle in tree")
		}
		seen[n.ID]++
		for _, ch := range n.Children {
			walk(ch, depth+1)
		}
	}
	walk(a.eng.BookmarkTree(), 0)
	live := 0
	for _, r := range a.eng.List(sc.Bookmarks) {
		live++
		if seen[r.ID] != 1 {
			t.Fatalf("node %s appears %d times", r.ID, seen[r.ID])
		}
	}
	t.Logf("random convergence OK: %d live bookmark nodes, %d settings", live, len(a.eng.SettingsMap()))
}

func TestBookmarkCycleAndOrdering(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("dave", "pass phrase two", "a")
	b := e.enroll(a, "dave", "pass phrase two", "b")
	must(t, a.eng.PutBookmark("F1", sc.Bookmark{Kind: "folder", Title: "F1", Parent: sc.BMToolbar, Index: "a"}))
	must(t, a.eng.PutBookmark("F2", sc.Bookmark{Kind: "folder", Title: "F2", Parent: sc.BMToolbar, Index: "b"}))
	a.sync(t)
	b.sync(t)
	// concurrent moves: F1 into F2 (a) and F2 into F1 (b) would form a cycle
	must(t, a.eng.PutBookmark("F1", sc.Bookmark{Kind: "folder", Title: "F1", Parent: "F2", Index: "a"}))
	must(t, b.eng.PutBookmark("F2", sc.Bookmark{Kind: "folder", Title: "F2", Parent: "F1", Index: "a"}))
	a.sync(t)
	b.sync(t)
	a.sync(t)
	assertEqual(t, a, b)
	tree := a.eng.BookmarkTree().Flatten("")
	t.Logf("tree after cycle-forming moves: %v", tree)
	joined := strings.Join(tree, "|")
	if !strings.Contains(joined, "F1") || !strings.Contains(joined, "F2") {
		t.Fatal("a folder vanished")
	}

	// IndexBetween property: always strictly between, repeatable
	rng := rand.New(rand.NewSource(1))
	keys := []string{"a", "z"}
	for i := 0; i < 500; i++ {
		sort.Strings(keys)
		j := rng.Intn(len(keys) - 1)
		m := sc.IndexBetween(keys[j], keys[j+1])
		if !(keys[j] < m && m < keys[j+1]) {
			t.Fatalf("IndexBetween(%q,%q)=%q not strictly between", keys[j], keys[j+1], m)
		}
		keys = append(keys, m)
	}
	if m := sc.IndexBetween("", ""); m == "" {
		t.Fatal("empty index")
	}
}

func TestTombstoneCompactionForcesResync(t *testing.T) {
	clk := newFakeClock()
	e := newEnv(t, func(c *syncserver.Config) { c.Now = clk.Now; c.SessionTTL = 1000 * 24 * time.Hour }, nil)
	a, _ := e.register("erin", "pass phrase three", "a")
	b := e.enroll(a, "erin", "pass phrase three", "b")
	must(t, a.eng.SetSetting("x", 1))
	must(t, a.eng.SetSetting("y", 2))
	a.sync(t)
	b.sync(t)
	// b goes away; a deletes x, server compacts after the retention window, then b returns
	must(t, a.eng.Delete(sc.Settings, "x"))
	a.sync(t)
	clk.Advance(100 * 24 * 3600 * 1e9)
	n, err := e.srv.Compact()
	must(t, err)
	if n != 1 {
		t.Fatalf("expected 1 tombstone purged, got %d", n)
	}
	rep, err := b.eng.Sync(ctx())
	must(t, err)
	if !rep.Resynced {
		t.Fatal("stale client must be told to resync")
	}
	if _, ok := b.eng.Setting("y"); !ok {
		t.Fatal("resync lost data")
	}
}
