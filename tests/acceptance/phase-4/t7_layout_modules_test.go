package phase4

import (
	"strings"
	"testing"

	sc "corvid/syncclient"
)

// fakeHost is the browser-side module registry of one device.
type fakeHost struct {
	have    map[string]bool
	enabled map[string]bool
}

func (h *fakeHost) Available(id, version string) bool { return h.have[id] }
func (h *fakeHost) SetEnabled(id string, on bool) error {
	h.enabled[id] = on
	return nil
}

// Acceptance 7: layout and module lists sync and apply on another device; modules
// that device does not have are handled gracefully (reported, not errors, not lost).
func TestAcceptance7_LayoutAndModulesSyncWithUnavailableModules(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("nora", "layouts passphrase 1", "linux")
	b := e.enroll(a, "nora", "layouts passphrase 1", "windows")

	must(t, a.eng.PutModule(sc.ModuleEntry{ID: "adblock", Version: "1.2", Enabled: true}))
	must(t, a.eng.PutModule(sc.ModuleEntry{ID: "vertical-tabs", Version: "0.9", Enabled: false}))
	must(t, a.eng.PutModule(sc.ModuleEntry{ID: "linux-gtk-theme", Version: "1.0", Enabled: true})) // not on Windows
	must(t, a.eng.PutLayout(sc.Layout{Name: "work", Slots: []sc.LayoutSlot{
		{Slot: "sidebar-left", Module: "vertical-tabs", Order: 1},
		{Slot: "toolbar", Module: "adblock", Order: 0},
		{Slot: "titlebar", Module: "linux-gtk-theme", Order: 2},
	}}))
	must(t, a.eng.SetSetting(sc.ActiveLayoutKey, "work"))
	a.sync(t)
	b.sync(t)

	host := &fakeHost{have: map[string]bool{"adblock": true, "vertical-tabs": true}, enabled: map[string]bool{}}
	rep, err := b.eng.ApplyModules(host)
	if err != nil {
		t.Fatalf("unavailable module must not be an error: %v", err)
	}
	if strings.Join(rep.Unavailable, ",") != "linux-gtk-theme" {
		t.Fatalf("unavailable = %v", rep.Unavailable)
	}
	if strings.Join(rep.Applied, ",") != "adblock,vertical-tabs" || !host.enabled["adblock"] || host.enabled["vertical-tabs"] {
		t.Fatalf("applied wrong: %v %v", rep.Applied, host.enabled)
	}
	l, ok := b.eng.ResolveLayout("work", host)
	if !ok || len(l.Slots) != 3 {
		t.Fatalf("layout not synced: %+v", l)
	}
	if l.Slots[0].Module != "adblock" || l.Slots[2].Module != "linux-gtk-theme" || !l.Slots[2].Unavailable || l.Slots[0].Unavailable {
		t.Fatalf("placeholder handling wrong: %+v", l.Slots)
	}
	if v, _ := b.eng.Setting(sc.ActiveLayoutKey); string(v) != `"work"` {
		t.Fatalf("active layout not synced: %s", v)
	}

	// Windows edits the layout (moves adblock); the unavailable module's slot must survive the round trip
	l.Slots[0].Slot = "sidebar-right"
	must(t, b.eng.PutLayout(l))
	b.sync(t)
	a.sync(t)
	back, _ := a.eng.ResolveLayout("work", &fakeHost{have: map[string]bool{"adblock": true, "vertical-tabs": true, "linux-gtk-theme": true}, enabled: map[string]bool{}})
	var kept, moved bool
	for _, s := range back.Slots {
		if s.Module == "linux-gtk-theme" && !s.Unavailable {
			kept = true
		}
		if s.Module == "adblock" && s.Slot == "sidebar-right" {
			moved = true
		}
	}
	if !kept || !moved {
		t.Fatalf("round trip lost data: kept=%v moved=%v %+v", kept, moved, back.Slots)
	}

	// module removal propagates as a tombstone
	must(t, a.eng.RemoveModule("vertical-tabs"))
	a.sync(t)
	b.sync(t)
	for _, m := range b.eng.ModuleList() {
		if m.ID == "vertical-tabs" {
			t.Fatal("module removal not propagated")
		}
	}
}

func TestCollectionTogglesAreHonoured(t *testing.T) {
	e := newEnv(t, nil, nil)
	a, _ := e.register("omar", "toggles passphrase 1", "a")
	b := e.enroll(a, "omar", "toggles passphrase 1", "b")
	must(t, b.eng.SetEnabled(sc.Passwords, false))
	must(t, a.eng.Put(sc.Passwords, "p", sc.PasswordItem{Origin: "o", Username: "u", Password: "x"}))
	must(t, a.eng.SetSetting("k", 1))
	a.sync(t)
	b.sync(t)
	if len(b.eng.List(sc.Passwords)) != 0 || len(b.eng.SettingsMap()) != 1 {
		t.Fatal("disabled collection leaked or enabled one missing")
	}
	must(t, b.eng.Put(sc.Passwords, "local-only", sc.PasswordItem{Origin: "o"}))
	b.sync(t)
	a.sync(t)
	if _, ok := a.eng.Get(sc.Passwords, "local-only"); ok {
		t.Fatal("disabled collection uploaded")
	}
	must(t, b.eng.SetEnabled(sc.Passwords, true))
	b.sync(t)
	a.sync(t)
	if len(b.eng.List(sc.Passwords)) != 2 || len(a.eng.List(sc.Passwords)) != 2 {
		t.Fatalf("re-enable did not catch up: %d %d", len(b.eng.List(sc.Passwords)), len(a.eng.List(sc.Passwords)))
	}
}
