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
