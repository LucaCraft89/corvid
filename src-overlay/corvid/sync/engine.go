package syncclient

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

// Standard collections.
const (
	Bookmarks  = "bookmarks"
	Passwords  = "passwords"
	Passkeys   = "passkeys"
	Settings   = "settings"
	Layouts    = "layouts"
	Modules    = "modules"
	Extensions = "extensions" // installed extension list + per-extension settings
	Themes     = "themes"
	History    = "history"
	Tabs       = "tabs" // open tabs: optional, OFF by default
)

// AllCollections is the complete, closed set of syncable collections.
// There is deliberately NO cookies collection: cookies never sync (enforced by
// ValidCollection here, the server allowlist, and tests).
var AllCollections = []string{Bookmarks, Passwords, Passkeys, Settings, Layouts, Modules, Extensions, Themes, History, Tabs}

// OffByDefault lists collections the user must switch on.
var OffByDefault = map[string]bool{Tabs: true}

// ErrBadCollection is returned for a collection that is not syncable (e.g. "cookies").
var ErrBadCollection = errors.New("syncclient: not a syncable collection")

// ValidCollection reports whether c may be synced.
func ValidCollection(c string) bool {
	for _, x := range AllCollections {
		if x == c {
			return true
		}
	}
	return false
}

// ---------- hybrid logical clock ----------

// HLC is a hybrid logical clock stamp, totally ordered by (Wall, Counter, Dev).
type HLC struct {
	Wall    int64  `json:"w"`
	Counter uint32 `json:"c"`
	Dev     string `json:"d"`
}

// Less orders stamps.
func (a HLC) Less(b HLC) bool {
	if a.Wall != b.Wall {
		return a.Wall < b.Wall
	}
	if a.Counter != b.Counter {
		return a.Counter < b.Counter
	}
	return a.Dev < b.Dev
}

// Clock produces monotonically increasing stamps.
type Clock struct {
	mu   sync.Mutex
	last HLC
	dev  string
	now  func() time.Time
}

func newClock(dev string, now func() time.Time, last HLC) *Clock {
	return &Clock{dev: dev, now: now, last: last}
}

// Tick returns a new stamp strictly greater than any previous or observed stamp.
func (c *Clock) Tick() HLC {
	c.mu.Lock()
	defer c.mu.Unlock()
	w := c.now().UnixMilli()
	if w > c.last.Wall {
		c.last = HLC{Wall: w, Dev: c.dev}
	} else {
		c.last = HLC{Wall: c.last.Wall, Counter: c.last.Counter + 1, Dev: c.dev}
	}
	return c.last
}

// Observe folds a remote stamp in, so later local ticks order after it.
func (c *Clock) Observe(r HLC) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.last.Wall < r.Wall || (c.last.Wall == r.Wall && c.last.Counter < r.Counter) {
		c.last = HLC{Wall: r.Wall, Counter: r.Counter, Dev: c.dev}
	}
}

// ---------- records and local state ----------

// Record is the decrypted view of a synced record.
type Record struct {
	Collection string          `json:"collection"`
	ID         string          `json:"id"`
	HLC        HLC             `json:"hlc"`
	Deleted    bool            `json:"deleted"`
	Data       json.RawMessage `json:"data,omitempty"`
}

// envelope is the encrypted plaintext (section 5.8).
type envelope struct {
	V          int             `json:"v"`
	Collection string          `json:"c"`
	ID         string          `json:"id"`
	HLC        HLC             `json:"hlc"`
	Deleted    bool            `json:"del,omitempty"`
	Data       json.RawMessage `json:"data,omitempty"`
}

type localRec struct {
	Record
	Seq   int64 `json:"seq"`   // server seq last known (base_seq for next push)
	Dirty bool  `json:"dirty"` // in the offline queue
}

// ConflictEntry preserves a local edit that lost to a newer remote version.
type ConflictEntry struct {
	Collection string          `json:"collection"`
	ID         string          `json:"id"`
	Lost       json.RawMessage `json:"lost"`
	LostHLC    HLC             `json:"lost_hlc"`
	WonHLC     HLC             `json:"won_hlc"`
}

// LocalState is the engine's persistent local database.
type LocalState struct {
	Records   map[string]map[string]*localRec `json:"records"` // collection -> logical id
	Cursors   map[string]int64                `json:"cursors"`
	HighSeq   int64                           `json:"high_seq"`
	Enabled   map[string]bool                 `json:"enabled"`
	Clock     HLC                             `json:"clock"`
	Conflicts []ConflictEntry                 `json:"conflicts"`
}

// LocalStore persists LocalState.
type LocalStore interface {
	Load() ([]byte, error)
	Save([]byte) error
}

// IntegrityError reports a record that failed authentication or could not be decrypted.
type IntegrityError struct {
	Collection string
	WireID     string
	Seq        int64
	Err        error
}

func (e IntegrityError) Error() string {
	return fmt.Sprintf("record %s/%s (seq %d) rejected: %v", e.Collection, e.WireID, e.Seq, e.Err)
}

// Report summarises one Sync call.
type Report struct {
	Pushed    int
	Pulled    int
	Applied   int
	Conflicts int // pushes bounced by the server and re-merged
	Lost      int // local edits that lost to newer remote ones
	Integrity []IntegrityError
	Rejected  []string
	Resynced  bool
}

// Engine is the sync engine for one account on one device.
type Engine struct {
	acct  *Account
	store LocalStore
	now   func() time.Time

	mu    sync.Mutex
	s     LocalState
	clock *Clock

	// Quarantine holds records that failed integrity checks (never applied).
	Quarantine []IntegrityError
	// Stats
	RecordsPushed int
}

// NewEngine loads local state and builds an engine. now may be nil.
func NewEngine(acct *Account, store LocalStore, now func() time.Time) (*Engine, error) {
	if now == nil {
		now = time.Now
	}
	e := &Engine{acct: acct, store: store, now: now}
	e.s = LocalState{Records: map[string]map[string]*localRec{}, Cursors: map[string]int64{}, Enabled: map[string]bool{}}
	if b, err := store.Load(); err != nil {
		return nil, err
	} else if len(b) > 0 {
		if err := json.Unmarshal(b, &e.s); err != nil {
			return nil, err
		}
		if e.s.Records == nil {
			e.s.Records = map[string]map[string]*localRec{}
		}
		if e.s.Cursors == nil {
			e.s.Cursors = map[string]int64{}
		}
		if e.s.Enabled == nil {
			e.s.Enabled = map[string]bool{}
		}
	}
	for _, c := range AllCollections {
		if _, ok := e.s.Enabled[c]; !ok {
			e.s.Enabled[c] = !OffByDefault[c]
		}
	}
	e.clock = newClock(acct.St.DeviceID, now, e.s.Clock)
	return e, nil
}

func (e *Engine) persist() error {
	e.s.Clock = e.clock.last
	b, err := json.Marshal(&e.s)
	if err != nil {
		return err
	}
	return e.store.Save(b)
}

// SetEnabled toggles a collection (per-collection toggles in corvid://sync).
func (e *Engine) SetEnabled(collection string, on bool) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.s.Enabled[collection] = on
	if on { // re-pull from scratch so records skipped while off are caught up
		e.s.Cursors[collection] = 0
	}
	return e.persist()
}

// Enabled reports the toggle state.
func (e *Engine) Enabled(collection string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.s.Enabled[collection]
}

func (e *Engine) col(c string) map[string]*localRec {
	m := e.s.Records[c]
	if m == nil {
		m = map[string]*localRec{}
		e.s.Records[c] = m
	}
	return m
}

// Put creates or updates a record locally and queues it for upload.
func (e *Engine) Put(collection, id string, data any) error {
	if !ValidCollection(collection) {
		return ErrBadCollection
	}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	m := e.col(collection)
	r := m[id]
	if r == nil {
		r = &localRec{}
		m[id] = r
	}
	r.Record = Record{Collection: collection, ID: id, HLC: e.clock.Tick(), Data: b}
	r.Dirty = true
	return e.persist()
}

// Delete tombstones a record locally and queues it for upload.
func (e *Engine) Delete(collection, id string) error {
	if !ValidCollection(collection) {
		return ErrBadCollection
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	m := e.col(collection)
	r := m[id]
	if r == nil {
		r = &localRec{}
		m[id] = r
	}
	r.Record = Record{Collection: collection, ID: id, HLC: e.clock.Tick(), Deleted: true}
	r.Dirty = true
	return e.persist()
}

// Get returns a live (non-deleted) record.
func (e *Engine) Get(collection, id string) (Record, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	r := e.s.Records[collection][id]
	if r == nil || r.Deleted {
		return Record{}, false
	}
	return r.Record, true
}

// List returns live records of a collection sorted by id.
func (e *Engine) List(collection string) []Record {
	e.mu.Lock()
	defer e.mu.Unlock()
	var out []Record
	for _, r := range e.s.Records[collection] {
		if !r.Deleted {
			out = append(out, r.Record)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Pending returns the number of queued (unsynced) records.
func (e *Engine) Pending() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	n := 0
	for c, m := range e.s.Records {
		if !e.s.Enabled[c] {
			continue
		}
		for _, r := range m {
			if r.Dirty {
				n++
			}
		}
	}
	return n
}

// Conflicts returns the log of local edits that lost to newer remote versions.
func (e *Engine) Conflicts() []ConflictEntry {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]ConflictEntry(nil), e.s.Conflicts...)
}

// ---------- sync ----------

const pushBatch = 100

// Sync pushes the offline queue and pulls remote changes until quiescent.
// Network errors leave the queue intact (offline-safe).
func (e *Engine) Sync(ctx context.Context) (Report, error) {
	var rep Report
	if !e.acct.Approved() {
		return rep, errors.New("syncclient: device not approved")
	}
	for round := 0; round < 10; round++ {
		n, err := e.push(ctx, &rep)
		if err != nil {
			return rep, err
		}
		if err := e.pull(ctx, &rep); err != nil {
			return rep, err
		}
		if n == 0 && e.Pending() == 0 {
			break
		}
		if e.Pending() == 0 {
			break
		}
	}
	return rep, nil
}

func (e *Engine) push(ctx context.Context, rep *Report) (int, error) {
	e.mu.Lock()
	type item struct {
		w  wireRecord
		rr *localRec
		h  HLC
	}
	var items []item
	kb := e.acct.St.Keybag
	epoch := kb.Latest()
	var keys []string
	for c := range e.s.Records {
		keys = append(keys, c)
	}
	sort.Strings(keys)
	for _, c := range keys {
		if !e.s.Enabled[c] {
			continue
		}
		var ids []string
		for id, r := range e.s.Records[c] {
			if r.Dirty {
				ids = append(ids, id)
			}
		}
		sort.Strings(ids)
		for _, id := range ids {
			r := e.s.Records[c][id]
			env := envelope{V: 1, Collection: c, ID: id, HLC: r.HLC, Deleted: r.Deleted, Data: r.Data}
			pt, _ := json.Marshal(env)
			rid := kb.RecordID(c, id)
			blob, err := kb.seal(e.acct.St.Username, c, rid, epoch, pt)
			if err != nil {
				e.mu.Unlock()
				return 0, err
			}
			items = append(items, item{w: wireRecord{Collection: c, ID: rid, Epoch: epoch, Blob: blob, Deleted: r.Deleted, BaseSeq: r.Seq}, rr: r, h: r.HLC})
		}
	}
	e.mu.Unlock()
	pushed := 0
	for i := 0; i < len(items); i += pushBatch {
		chunk := items[i:min(i+pushBatch, len(items))]
		ws := make([]wireRecord, len(chunk))
		for j := range chunk {
			ws[j] = chunk[j].w
		}
		var out struct {
			Results []struct {
				ID     string `json:"id"`
				Status string `json:"status"`
				Seq    int64  `json:"seq"`
				Reason string `json:"reason"`
			} `json:"results"`
			HeadSeq int64 `json:"head_seq"`
		}
		if err := e.acct.tr.do(ctx, "POST", "/v1/records/push", nil, map[string]any{"records": ws}, &out); err != nil {
			return pushed, err
		}
		e.RecordsPushed += len(chunk)
		e.mu.Lock()
		for j, r := range out.Results {
			if j >= len(chunk) {
				break
			}
			it := chunk[j]
			switch r.Status {
			case "ok":
				// Only clear dirty if the record was not edited again meanwhile.
				if it.rr.HLC == it.h {
					it.rr.Dirty = false
				}
				it.rr.Seq = r.Seq
				pushed++
				rep.Pushed++
			case "conflict":
				rep.Conflicts++
				it.rr.Seq = r.Seq // retry on top of the server version after the pull merges it
			default:
				rep.Rejected = append(rep.Rejected, it.rr.Collection+"/"+it.rr.ID+": "+r.Reason)
				it.rr.Dirty = false // rejected permanently (quota/size); surfaced in the report
			}
		}
		if out.HeadSeq > e.s.HighSeq {
			e.s.HighSeq = out.HeadSeq
		}
		e.mu.Unlock()
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	return pushed, e.persist()
}

func (e *Engine) pull(ctx context.Context, rep *Report) error {
	for _, c := range AllCollections {
		if !e.Enabled(c) {
			continue
		}
		refreshed := false
		resync := false
		seen := map[string]bool{}
		for {
			e.mu.Lock()
			since := e.s.Cursors[c]
			e.mu.Unlock()
			var out struct {
				Records []wireRecord `json:"records"`
				Next    int64        `json:"next_seq"`
				More    bool         `json:"more"`
				Head    int64        `json:"head_seq"`
			}
			q := map[string][]string{"collection": {c}, "since": {fmt.Sprint(since)}, "limit": {"200"}}
			err := e.acct.tr.do(ctx, "GET", "/v1/records/pull", q, nil, &out)
			var ae *APIError
			if errors.As(err, &ae) && ae.Code == "resync_required" {
				e.mu.Lock()
				e.s.Cursors[c] = 0
				e.mu.Unlock()
				rep.Resynced = true
				resync = true
				seen = map[string]bool{}
				continue
			}
			if errors.As(err, &ae) && ae.Code == "cursor_ahead" {
				return ErrServerRollback
			}
			if err != nil {
				return err
			}
			e.mu.Lock()
			if out.Head < e.s.HighSeq {
				e.mu.Unlock()
				return ErrServerRollback
			}
			e.s.HighSeq = out.Head
			needRefresh := false
			for _, wr := range out.Records {
				rep.Pulled++
				if id, err := e.merge(c, wr, rep); err == nil {
					seen[id] = true
				} else {
					if errors.Is(err, ErrUnknownEpoch) && !refreshed {
						needRefresh = true
						break
					}
					ie := IntegrityError{Collection: c, WireID: wr.ID, Seq: wr.Seq, Err: err}
					rep.Integrity = append(rep.Integrity, ie)
					e.Quarantine = append(e.Quarantine, ie)
				}
			}
			if needRefresh {
				e.mu.Unlock()
				refreshed = true
				if err := e.acct.RefreshKeys(ctx); err != nil {
					return err
				}
				continue // retry the same cursor with the new keys
			}
			if out.Next > e.s.Cursors[c] {
				e.s.Cursors[c] = out.Next
			}
			err = e.persist()
			e.mu.Unlock()
			if err != nil {
				return err
			}
			if !out.More {
				if resync {
					// Tombstones older than the server's retention window are gone: anything
					// we hold as clean but the full listing lacks was deleted elsewhere.
					e.mu.Lock()
					for id, r := range e.s.Records[c] {
						if seen[id] {
							continue
						}
						if r.Dirty {
							r.Seq = 0
						} else if r.Seq > 0 {
							delete(e.s.Records[c], id)
						}
					}
					err = e.persist()
					e.mu.Unlock()
					if err != nil {
						return err
					}
				}
				break
			}
		}
	}
	return nil
}

// merge applies one remote record (caller holds e.mu). Returns an error if it
// must be quarantined (integrity) or the key is missing (unknown epoch).
func (e *Engine) merge(collection string, wr wireRecord, rep *Report) (string, error) {
	if wr.Collection != collection {
		return "", ErrIntegrity
	}
	kb := e.acct.St.Keybag
	pt, err := kb.open(e.acct.St.Username, collection, wr.ID, wr.Epoch, wr.Blob)
	if err != nil {
		return "", err
	}
	var env envelope
	if json.Unmarshal(pt, &env) != nil || env.V != 1 || env.Collection != collection || kb.RecordID(collection, env.ID) != wr.ID || env.Deleted != wr.Deleted {
		return "", ErrIntegrity
	}
	e.clock.Observe(env.HLC)
	m := e.col(collection)
	l := m[env.ID]
	if l == nil {
		m[env.ID] = &localRec{Record: Record{Collection: collection, ID: env.ID, HLC: env.HLC, Deleted: env.Deleted, Data: env.Data}, Seq: wr.Seq}
		rep.Applied++
		return env.ID, nil
	}
	if collection == History && !l.Deleted && !env.Deleted && l.HLC != env.HLC {
		// History is a union: visits recorded on different devices must not overwrite each other.
		if merged := mergeHistory(l.Data, env.Data); string(merged) != string(env.Data) {
			l.Record = Record{Collection: collection, ID: env.ID, HLC: e.clock.Tick(), Data: merged}
			l.Seq, l.Dirty = wr.Seq, true
			return env.ID, nil
		}
	}
	switch {
	case l.HLC == env.HLC: // same version (our own push echoed back, or already merged)
		l.Seq = wr.Seq
	case l.HLC.Less(env.HLC): // remote wins
		if l.Dirty {
			e.s.Conflicts = append(e.s.Conflicts, ConflictEntry{Collection: collection, ID: env.ID, Lost: l.Data, LostHLC: l.HLC, WonHLC: env.HLC})
			rep.Lost++
		}
		l.Record = Record{Collection: collection, ID: env.ID, HLC: env.HLC, Deleted: env.Deleted, Data: env.Data}
		l.Seq, l.Dirty = wr.Seq, false
		rep.Applied++
	default: // local is newer: keep it, re-push on top of this server version
		l.Seq, l.Dirty = wr.Seq, true
	}
	return env.ID, nil
}
