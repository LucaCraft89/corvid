package phase4

import (
	"errors"
	"testing"

	sc "corvid/syncclient"
)

// Acceptance 5a: the recovery key restores access on a fresh device (no passphrase, no other device).
func TestAcceptance5_RecoveryKeyOnFreshDevice(t *testing.T) {
	e := newEnv(t, nil, nil)
	const oldPass = "original passphrase 123"
	a, rk := e.register("lena", oldPass, "first")
	must(t, a.eng.PutBookmark("b", sc.Bookmark{Kind: "url", Title: "T", URL: "https://keep.example", Parent: sc.BMToolbar, Index: "a"}))
	must(t, a.eng.Put(sc.Passwords, "p", sc.PasswordItem{Origin: "o", Username: "u", Password: "precious"}))
	a.sync(t)

	// malformed / mistyped keys never reach the network
	if _, err := sc.ParseRecoveryKey("AAAA-BBBB"); !errors.Is(err, sc.ErrBadRecoveryKey) {
		t.Fatalf("short key accepted: %v", err)
	}
	typo := []byte(rk.String())
	if typo[0] == 'A' {
		typo[0] = 'B'
	} else {
		typo[0] = 'A'
	}
	if _, err := sc.ParseRecoveryKey(string(typo)); !errors.Is(err, sc.ErrBadRecoveryKey) {
		t.Fatalf("checksum did not catch typo: %v", err)
	}
	// a syntactically valid but wrong key is rejected by the server
	other := sc.NewRecoveryKey()
	if _, err := sc.Recover(ctx(), e.ts.URL, "lena", other, "whatever pass 999", "fresh", &sc.MemStateStore{}, nil); err == nil {
		t.Fatal("wrong recovery key accepted")
	}

	// the real one, typed back from its displayed form (lowercase, spaces)
	parsed, err := sc.ParseRecoveryKey(lowerSpaced(rk.String()))
	must(t, err)
	const newPass = "brand new passphrase 456"
	fresh, err := sc.Recover(ctx(), e.ts.URL, "lena", parsed, newPass, "fresh-device", &sc.MemStateStore{}, nil)
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	fd := &device{acct: fresh, eng: e.newEngine(fresh), name: "fresh"}
	fd.sync(t)
	assertEqual(t, a, fd)
	if r, ok := fd.eng.Get(sc.Passwords, "p"); !ok || len(r.Data) == 0 {
		t.Fatal("password not restored")
	}
	// the old passphrase is dead, the new one works
	if _, err := sc.Login(ctx(), e.ts.URL, "lena", oldPass, "x", &sc.MemStateStore{}, nil); !errors.Is(err, sc.ErrWrongPassphrase) {
		t.Fatalf("old passphrase still valid: %v", err)
	}
	// rotate the recovery key: the old one stops working
	newRK, err := fresh.RotateRecoveryKey(ctx())
	must(t, err)
	if _, err := sc.Recover(ctx(), e.ts.URL, "lena", parsed, "zzz zzz zzz zzz", "x", &sc.MemStateStore{}, nil); err == nil {
		t.Fatal("rotated-out recovery key still works")
	}
	if _, err := sc.Recover(ctx(), e.ts.URL, "lena", newRK, "yet another one 1", "y", &sc.MemStateStore{}, nil); err != nil {
		t.Fatalf("new recovery key: %v", err)
	}
}

func lowerSpaced(s string) string {
	out := []byte{}
	for _, c := range []byte(s) {
		switch {
		case c == '-':
			out = append(out, ' ')
		case c >= 'A' && c <= 'Z':
			out = append(out, c+32)
		default:
			out = append(out, c)
		}
	}
	return string(out)
}

// Acceptance 5b: passphrase change re-wraps keys without re-uploading data.
func TestAcceptance5_PassphraseChangeRewrapsWithoutReupload(t *testing.T) {
	e := newEnv(t, nil, nil)
	const oldPass, newPass = "old passphrase 111", "new passphrase 222"
	a, _ := e.register("mona", oldPass, "a")
	b := e.enroll(a, "mona", oldPass, "b")
	for i := 0; i < 50; i++ {
		must(t, a.eng.Put(sc.Passwords, string(rune('A'+i%26))+string(rune('a'+i/26)), sc.PasswordItem{Origin: "o", Username: "u", Password: "p"}))
	}
	a.sync(t)
	b.sync(t)

	pushesBefore := e.count("POST /v1/records/push")
	recordsBefore := a.eng.RecordsPushed
	must(t, a.acct.ChangePassphrase(ctx(), oldPass, newPass))
	if got := e.count("POST /v1/records/push"); got != pushesBefore {
		t.Fatalf("passphrase change uploaded records: push calls %d -> %d", pushesBefore, got)
	}
	if a.eng.RecordsPushed != recordsBefore {
		t.Fatal("engine pushed records during passphrase change")
	}
	if e.count("POST /v1/password/finish") != 1 {
		t.Fatalf("expected exactly one rewrap upload, got %d", e.count("POST /v1/password/finish"))
	}

	// other device's session was revoked by the change; it must log in with the new passphrase and keeps its data
	if _, err := b.eng.Sync(ctx()); !errors.Is(err, sc.ErrUnauthorized) {
		t.Fatalf("stale session after passphrase change: %v", err)
	}
	if _, err := sc.Login(ctx(), e.ts.URL, "mona", oldPass, "b", &sc.MemStateStore{}, nil); !errors.Is(err, sc.ErrWrongPassphrase) {
		t.Fatalf("old passphrase still works: %v", err)
	}
	b2, err := sc.Login(ctx(), e.ts.URL, "mona", newPass, "b", stateOf(b), nil)
	must(t, err)
	b.acct = b2
	b.eng, err = sc.NewEngine(b2, &sc.MemLocalStore{}, nil)
	must(t, err)
	b.sync(t)
	if len(b.eng.List(sc.Passwords)) != 50 {
		t.Fatalf("data not readable after rewrap: %d", len(b.eng.List(sc.Passwords)))
	}

	// a brand-new device enrolling with the NEW passphrase decrypts the same data (keybag unchanged)
	c := e.enroll(a, "mona", newPass, "c")
	c.sync(t)
	assertEqual(t, a, c)

	// and revocation (which rewraps again under the current passphrase) still works afterwards
	must(t, a.acct.RevokeDevice(ctx(), c.acct.St.DeviceID, newPass))
}

func stateOf(d *device) sc.StateStore {
	return lostStore(d)
}
