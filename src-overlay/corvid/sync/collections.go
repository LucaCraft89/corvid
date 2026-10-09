package syncclient

import (
	"encoding/json"
	"sort"
)

// ---------- settings: merged by key ----------

// SetSetting stores one setting key (each key is its own record, so edits to
// different keys on different devices never conflict).
func (e *Engine) SetSetting(key string, value any) error { return e.Put(Settings, key, value) }

// Setting returns the raw JSON value of a key.
func (e *Engine) Setting(key string) (json.RawMessage, bool) {
	r, ok := e.Get(Settings, key)
	return r.Data, ok
}

// SettingsMap returns all live settings.
func (e *Engine) SettingsMap() map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	for _, r := range e.List(Settings) {
		out[r.ID] = r.Data
	}
	return out
}

// ---------- layouts ----------

// ActiveLayoutKey is the settings key naming the active layout.
const ActiveLayoutKey = "layout.active"

// LayoutSlot places a module into a slot of the chrome.
type LayoutSlot struct {
	Slot        string `json:"slot"`
	Module      string `json:"module"`
	Order       int    `json:"order"`
	Unavailable bool   `json:"unavailable,omitempty"` // set by ResolveLayout, never synced
}

// Layout is a named arrangement.
type Layout struct {
	Name  string       `json:"name"`
	Slots []LayoutSlot `json:"slots"`
}

// PutLayout stores a layout.
func (e *Engine) PutLayout(l Layout) error {
	for i := range l.Slots {
		l.Slots[i].Unavailable = false
	}
	return e.Put(Layouts, l.Name, l)
}

// ModuleHost is what the browser tells the engine about locally available modules.
type ModuleHost interface {
	// Available reports whether module id (at least version) is installed or installable here.
	Available(id, version string) bool
}

// ResolveLayout returns the layout with slots whose module is unavailable on
// this device flagged (rendered as placeholders), never dropped, so syncing the
// layout back does not lose them.
func (e *Engine) ResolveLayout(name string, host ModuleHost) (Layout, bool) {
	r, ok := e.Get(Layouts, name)
	if !ok {
		return Layout{}, false
	}
	var l Layout
	if json.Unmarshal(r.Data, &l) != nil {
		return Layout{}, false
	}
	mods := map[string]ModuleEntry{}
	for _, m := range e.ModuleList() {
		mods[m.ID] = m
	}
	for i, s := range l.Slots {
		v := ""
		if m, ok := mods[s.Module]; ok {
			v = m.Version
		}
		l.Slots[i].Unavailable = !host.Available(s.Module, v)
	}
	sort.SliceStable(l.Slots, func(i, j int) bool { return l.Slots[i].Order < l.Slots[j].Order })
	return l, true
}

// ---------- modules ----------

// ModuleEntry is the synced description of an installed module.
type ModuleEntry struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	Enabled bool   `json:"enabled"`
	Source  string `json:"source,omitempty"`
}

// PutModule records a module in the synced list.
func (e *Engine) PutModule(m ModuleEntry) error { return e.Put(Modules, m.ID, m) }

// RemoveModule removes a module from the synced list.
func (e *Engine) RemoveModule(id string) error { return e.Delete(Modules, id) }

// ModuleList returns the synced module list sorted by id.
func (e *Engine) ModuleList() []ModuleEntry {
	var out []ModuleEntry
	for _, r := range e.List(Modules) {
		var m ModuleEntry
		if json.Unmarshal(r.Data, &m) == nil {
			m.ID = r.ID
			out = append(out, m)
		}
	}
	return out
}

// ModuleApplyReport says what happened when applying the synced module list.
type ModuleApplyReport struct {
	Applied     []string // available here and now enabled/disabled per the list
	Unavailable []string // known to the account, not installable on this device (kept, shown to the user)
}

// ModuleApplier lets the browser enable/disable modules.
type ModuleApplier interface {
	ModuleHost
	SetEnabled(id string, enabled bool) error
}

// ApplyModules applies the synced list. Unavailable modules never produce an
// error: they are reported so the UI can show "not available on this device".
func (e *Engine) ApplyModules(a ModuleApplier) (ModuleApplyReport, error) {
	var rep ModuleApplyReport
	for _, m := range e.ModuleList() {
		if !a.Available(m.ID, m.Version) {
			rep.Unavailable = append(rep.Unavailable, m.ID)
			continue
		}
		if err := a.SetEnabled(m.ID, m.Enabled); err != nil {
			rep.Unavailable = append(rep.Unavailable, m.ID)
			continue
		}
		rep.Applied = append(rep.Applied, m.ID)
	}
	return rep, nil
}

// ---------- passwords / passkeys (per-record LWW) ----------

// PasswordItem is the plaintext of a password record. The sync layer never logs or indexes it.
type PasswordItem struct {
	Origin   string `json:"origin"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// PasskeyItem is the plaintext of a passkey record.
type PasskeyItem struct {
	CredentialID string `json:"credential_id"`
	RPID         string `json:"rp_id"`
	UserHandle   string `json:"user_handle"`
	PrivateKey   string `json:"private_key"`
	Counter      uint32 `json:"counter"`
}

// ---------- extensions ----------

// ExtensionEntry is the synced description of an installed extension (list + settings, never code or its storage).
type ExtensionEntry struct {
	ID       string          `json:"id"` // store/extension id
	Version  string          `json:"version"`
	Source   string          `json:"source"` // configured extension source name
	Enabled  bool            `json:"enabled"`
	Settings json.RawMessage `json:"settings,omitempty"`
}

// PutExtension records an installed extension.
func (e *Engine) PutExtension(x ExtensionEntry) error { return e.Put(Extensions, x.ID, x) }

// ExtensionList returns the synced extension list.
func (e *Engine) ExtensionList() []ExtensionEntry {
	var out []ExtensionEntry
	for _, r := range e.List(Extensions) {
		var x ExtensionEntry
		if json.Unmarshal(r.Data, &x) == nil {
			x.ID = r.ID
			out = append(out, x)
		}
	}
	return out
}

// ---------- themes ----------

// ThemeEntry is a theme definition (seed colour, scheme, custom tokens).
type ThemeEntry struct {
	Name   string            `json:"name"`
	Seed   string            `json:"seed"`
	Scheme string            `json:"scheme"` // light | dark | system
	Tokens map[string]string `json:"tokens,omitempty"`
}

// PutTheme stores a theme.
func (e *Engine) PutTheme(t ThemeEntry) error { return e.Put(Themes, t.Name, t) }

// ---------- history (union merge) ----------

const maxVisits = 50

// HistoryItem is one URL with its recent visit times (ms). The record id is chosen by the caller (e.g. hash of URL).
type HistoryItem struct {
	URL    string  `json:"url"`
	Title  string  `json:"title"`
	Visits []int64 `json:"visits"`
}

// RecordVisit adds a visit to the URL's history record (merging with what is already known locally).
func (e *Engine) RecordVisit(id, url, title string, atMs int64) error {
	h := HistoryItem{URL: url, Title: title}
	if r, ok := e.Get(History, id); ok {
		_ = json.Unmarshal(r.Data, &h)
		h.Title = title
	}
	h.Visits = append(h.Visits, atMs)
	h.Visits = normVisits(h.Visits)
	return e.Put(History, id, h)
}

func normVisits(v []int64) []int64 {
	sort.Slice(v, func(i, j int) bool { return v[i] < v[j] })
	out := v[:0]
	for i, x := range v {
		if i == 0 || x != v[i-1] {
			out = append(out, x)
		}
	}
	if len(out) > maxVisits {
		out = out[len(out)-maxVisits:]
	}
	return out
}

// mergeHistory unions visit lists; remote's title wins ties (callers apply it only when the data differ).
func mergeHistory(local, remote json.RawMessage) json.RawMessage {
	var a, b HistoryItem
	if json.Unmarshal(local, &a) != nil || json.Unmarshal(remote, &b) != nil {
		return remote
	}
	m := b
	m.Visits = normVisits(append(append([]int64(nil), a.Visits...), b.Visits...))
	out, _ := json.Marshal(m)
	// keep remote's exact bytes when nothing was added, so the caller sees "no change"
	var bb HistoryItem
	_ = json.Unmarshal(remote, &bb)
	bb.Visits = normVisits(append([]int64(nil), bb.Visits...))
	if eq, _ := json.Marshal(bb); string(eq) == string(out) {
		return remote
	}
	return out
}
