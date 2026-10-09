package syncclient

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"

	"github.com/bytemare/opaque"
	"golang.org/x/crypto/nacl/box"
)

const serverIdentity = "corvid-sync"

// StateStore persists the device state (keys, token). On a real browser this
// is the OS-protected key store; tests use MemStateStore / FileStateStore.
type StateStore interface {
	Load() ([]byte, error)
	Save([]byte) error
}

// MemStateStore keeps state in memory.
type MemStateStore struct {
	mu sync.Mutex
	b  []byte
}

func (m *MemStateStore) Load() ([]byte, error) { m.mu.Lock(); defer m.mu.Unlock(); return m.b, nil }
func (m *MemStateStore) Save(b []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.b = append([]byte(nil), b...)
	return nil
}

// FileStateStore keeps state in a 0600 file, written atomically.
type FileStateStore struct{ Path string }

func (f FileStateStore) Load() ([]byte, error) {
	b, err := os.ReadFile(f.Path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	return b, err
}

func (f FileStateStore) Save(b []byte) error {
	tmp := f.Path + ".tmp"
	if err := os.MkdirAll(filepath.Dir(f.Path), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, f.Path)
}

// DeviceState is everything a device must remember.
type DeviceState struct {
	ServerURL  string  `json:"server_url"`
	Username   string  `json:"username"`
	DeviceID   string  `json:"device_id"`
	DeviceName string  `json:"device_name"`
	DevPub     []byte  `json:"dev_pub"`
	DevPriv    []byte  `json:"dev_priv"`
	Keybag     *Keybag `json:"keybag,omitempty"`
	Token      string  `json:"token,omitempty"`
	Approved   bool    `json:"approved"`
}

// Account is an authenticated handle for one device on one server account.
type Account struct {
	tr    *transport
	St    *DeviceState
	store StateStore
	hc    *http.Client
}

func (a *Account) save() error {
	b, err := json.Marshal(a.St)
	if err != nil {
		return err
	}
	return a.store.Save(b)
}

func newDevice(serverURL, username, deviceName string) *DeviceState {
	pub, priv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}
	id := make([]byte, 16)
	_, _ = rand.Read(id)
	return &DeviceState{ServerURL: serverURL, Username: username, DeviceID: hex.EncodeToString(id), DeviceName: deviceName,
		DevPub: pub[:], DevPriv: priv[:]}
}

func (a *Account) dev() deviceInfo {
	return deviceInfo{ID: a.St.DeviceID, Name: a.St.DeviceName, Pub: a.St.DevPub}
}

// OpenAccount restores an account handle from stored state (no network).
func OpenAccount(store StateStore, hc *http.Client) (*Account, error) {
	b, err := store.Load()
	if err != nil || len(b) == 0 {
		return nil, errors.New("syncclient: no saved account")
	}
	var st DeviceState
	if err := json.Unmarshal(b, &st); err != nil {
		return nil, err
	}
	a := &Account{St: &st, store: store, hc: hc, tr: newTransport(st.ServerURL, hc)}
	a.tr.token = st.Token
	return a, nil
}

func opaqueConf() *opaque.Configuration { return opaque.DefaultConfiguration() }

// opaqueRegister runs the client side of OPAQUE registration against startPath.
func opaqueRegister(ctx context.Context, tr *transport, startPath string, extra map[string]any, passphrase, username string) (regID string, record, exportKey []byte, err error) {
	c, err := opaqueConf().Client()
	if err != nil {
		return "", nil, nil, err
	}
	req, err := c.RegistrationInit([]byte(passphrase))
	if err != nil {
		return "", nil, nil, err
	}
	body := map[string]any{"request": req.Serialize()}
	for k, v := range extra {
		body[k] = v
	}
	var sr struct {
		RegID    string `json:"reg_id"`
		Response []byte `json:"response"`
	}
	if err := tr.do(ctx, "POST", startPath, nil, body, &sr); err != nil {
		return "", nil, nil, err
	}
	resp, err := c.Deserialize.RegistrationResponse(sr.Response)
	if err != nil {
		return "", nil, nil, err
	}
	rec, ek, err := c.RegistrationFinalize(resp, []byte(username), []byte(serverIdentity))
	if err != nil {
		return "", nil, nil, err
	}
	return sr.RegID, rec.Serialize(), ek, nil
}

type loginResult struct {
	Token string `json:"token"`
	State string `json:"state"`
	Epoch int    `json:"epoch"`
}

func opaqueLogin(ctx context.Context, tr *transport, username, passphrase string, dev deviceInfo) (*loginResult, []byte, error) {
	c, err := opaqueConf().Client()
	if err != nil {
		return nil, nil, err
	}
	ke1, err := c.GenerateKE1([]byte(passphrase))
	if err != nil {
		return nil, nil, err
	}
	var st struct {
		LoginID string `json:"login_id"`
		KE2     []byte `json:"ke2"`
	}
	if err := tr.do(ctx, "POST", "/v1/login/start", nil, map[string]any{"username": username, "ke1": ke1.Serialize()}, &st); err != nil {
		return nil, nil, err
	}
	ke2, err := c.Deserialize.KE2(st.KE2)
	if err != nil {
		return nil, nil, err
	}
	ke3, _, ek, err := c.GenerateKE3(ke2, []byte(username), []byte(serverIdentity))
	if err != nil {
		// Wrong passphrase, unknown user (fake record) or an impostor server: all look the same.
		return nil, nil, ErrWrongPassphrase
	}
	var lr loginResult
	if err := tr.do(ctx, "POST", "/v1/login/finish", nil, map[string]any{"login_id": st.LoginID, "ke3": ke3.Serialize(), "device": dev}, &lr); err != nil {
		return nil, nil, err
	}
	return &lr, ek, nil
}

// Register creates a new account with this device as the first (auto-approved) device.
// The returned recovery key must be shown to the user exactly once.
func Register(ctx context.Context, serverURL, username, passphrase, regToken, deviceName string, store StateStore, hc *http.Client) (*Account, RecoveryKey, error) {
	a := &Account{St: newDevice(serverURL, username, deviceName), store: store, hc: hc, tr: newTransport(serverURL, hc)}
	regID, record, ek, err := opaqueRegister(ctx, a.tr, "/v1/register/start", map[string]any{"username": username, "token": regToken}, passphrase, username)
	if err != nil {
		return nil, RecoveryKey{}, err
	}
	kb := NewKeybag()
	rk := NewRecoveryKey()
	rkeys := rk.derive()
	pkg, err := sealTo(rkeys.boxPub, kb)
	if err != nil {
		return nil, rk, err
	}
	_ = ek // OPAQUE export key is intentionally unused: the passphrase never protects data keys
	var lr loginResult
	err = a.tr.do(ctx, "POST", "/v1/register/finish", nil, map[string]any{
		"reg_id": regID, "record": record, "device": a.dev(),
		"recovery": recoveryInfo{SignPub: rkeys.signPub, BoxPub: rkeys.boxPub, Pkg: pkg},
	}, &lr)
	if err != nil {
		return nil, rk, err
	}
	a.St.Keybag, a.St.Token, a.St.Approved = kb, lr.Token, true
	a.tr.token = lr.Token
	return a, rk, a.save()
}

// Login authenticates this device. On a device unknown to the account the
// result is a pending device; call WaitApproved/Poll after another device approves it.
func Login(ctx context.Context, serverURL, username, passphrase, deviceName string, store StateStore, hc *http.Client) (*Account, error) {
	var a *Account
	if b, _ := store.Load(); len(b) > 0 {
		if acc, err := OpenAccount(store, hc); err == nil && acc.St.Username == username && acc.St.ServerURL == serverURL {
			a = acc
		}
	}
	if a == nil {
		a = &Account{St: newDevice(serverURL, username, deviceName), store: store, hc: hc, tr: newTransport(serverURL, hc)}
	}
	a.tr.token = ""
	lr, _, err := opaqueLogin(ctx, a.tr, username, passphrase, a.dev())
	if err != nil {
		return nil, err
	}
	a.tr.token, a.St.Token = lr.Token, lr.Token
	if lr.State == "approved" && a.St.Keybag == nil {
		if err := a.Poll(ctx); err != nil {
			return nil, err
		}
	}
	a.St.Approved = lr.State == "approved"
	return a, a.save()
}

// Poll checks approval status and, once approved, installs the keybag delivered by the approving device.
func (a *Account) Poll(ctx context.Context) error {
	var out struct {
		State string `json:"state"`
		Pkg   []byte `json:"pkg"`
	}
	if err := a.tr.do(ctx, "GET", "/v1/devices/self", nil, nil, &out); err != nil {
		return err
	}
	a.St.Approved = out.State == "approved"
	if a.St.Approved && len(out.Pkg) > 0 {
		kb, err := openSealed(a.St.DevPub, a.St.DevPriv, out.Pkg)
		if err != nil {
			return err
		}
		a.mergeKeybag(kb)
	}
	return a.save()
}

func (a *Account) mergeKeybag(kb *Keybag) {
	if a.St.Keybag == nil {
		a.St.Keybag = kb
		return
	}
	for e, k := range kb.Keys {
		a.St.Keybag.Keys[e] = k
	}
}

// RefreshKeys re-reads the sealed package for this device (after a rotation by another device).
func (a *Account) RefreshKeys(ctx context.Context) error { return a.Poll(ctx) }

// ApprovalCode is the short comparison code this device shows so the user can check it against
// the one the approving device displays (guards against a server swapping the public key).
func (a *Account) ApprovalCode() string { return Fingerprint(a.St.DevPub) }

// Approved reports whether this device holds the keys.
func (a *Account) Approved() bool { return a.St.Approved && a.St.Keybag != nil }

// Devices lists devices.
func (a *Account) Devices(ctx context.Context) ([]DeviceEntry, error) {
	var out struct {
		Devices []DeviceEntry `json:"devices"`
	}
	if err := a.tr.do(ctx, "GET", "/v1/devices", nil, nil, &out); err != nil {
		return nil, err
	}
	for i := range out.Devices {
		out.Devices[i].Fingerprint = Fingerprint(out.Devices[i].Pub)
	}
	return out.Devices, nil
}

// ApproveDevice seals the keybag to a pending device. The caller (UI) must
// have shown the fingerprint to the user; wantFingerprint, if set, is checked.
func (a *Account) ApproveDevice(ctx context.Context, id, wantFingerprint string) error {
	devs, err := a.Devices(ctx)
	if err != nil {
		return err
	}
	for _, d := range devs {
		if d.ID == id && d.State == "pending" {
			if wantFingerprint != "" && d.Fingerprint != wantFingerprint {
				return errors.New("syncclient: fingerprint mismatch")
			}
			pkg, err := sealTo(d.Pub, a.St.Keybag)
			if err != nil {
				return err
			}
			return a.tr.do(ctx, "POST", "/v1/devices/"+id+"/approve", nil, map[string]any{"pkg": pkg}, nil)
		}
	}
	return errors.New("syncclient: no such pending device")
}

// reauth verifies the passphrase (full OPAQUE login) and returns the current export key.
func (a *Account) reauth(ctx context.Context, passphrase string) ([]byte, error) {
	t := newTransport(a.St.ServerURL, a.hc)
	lr, ek, err := opaqueLogin(ctx, t, a.St.Username, passphrase, a.dev())
	if err != nil {
		return nil, err
	}
	a.tr.token, a.St.Token = lr.Token, lr.Token
	return ek, nil
}

// RevokeDevice revokes a device and rotates the data key epoch so the revoked
// device cannot decrypt anything written afterwards. Requires the passphrase
// (re-verified) to refresh the passphrase-wrapped copy of the keybag.
func (a *Account) RevokeDevice(ctx context.Context, id, passphrase string) error {
	if _, err := a.reauth(ctx, passphrase); err != nil {
		return err
	}
	devs, err := a.Devices(ctx)
	if err != nil {
		return err
	}
	var target *DeviceEntry
	for i := range devs {
		if devs[i].ID == id {
			target = &devs[i]
		}
	}
	if target == nil {
		return errors.New("syncclient: no such device")
	}
	body := map[string]any{}
	kb := a.St.Keybag.clone()
	if target.State == "approved" {
		kb.Rotate()
		recPkg, err := a.recoveryPkgFor(ctx, kb)
		if err != nil {
			return err
		}
		pkgs := map[string][]byte{}
		for _, d := range devs {
			if d.State == "approved" && d.ID != id {
				p, err := sealTo(d.Pub, kb)
				if err != nil {
					return err
				}
				pkgs[d.ID] = p
			}
		}
		body = map[string]any{"epoch": kb.Latest(), "recovery_pkg": recPkg, "packages": pkgs}
	}
	if err := a.tr.do(ctx, "POST", "/v1/devices/"+id+"/revoke", nil, body, nil); err != nil {
		return err
	}
	if target.State == "approved" {
		a.St.Keybag = kb
	}
	return a.save()
}

func (a *Account) recoveryPkgFor(ctx context.Context, kb *Keybag) ([]byte, error) {
	var ks struct {
		Recovery recoveryInfo `json:"recovery"`
	}
	if err := a.tr.do(ctx, "GET", "/v1/keys", nil, nil, &ks); err != nil {
		return nil, err
	}
	return sealTo(ks.Recovery.BoxPub, kb)
}

// ChangePassphrase re-registers the OPAQUE credential. The passphrase only authenticates;
// it never protects data keys (strict model), so no key or record is touched or re-uploaded.
func (a *Account) ChangePassphrase(ctx context.Context, oldPass, newPass string) error {
	if _, err := a.reauth(ctx, oldPass); err != nil {
		return err
	}
	return a.setPassphrase(ctx, newPass)
}

func (a *Account) setPassphrase(ctx context.Context, newPass string) error {
	regID, record, _, err := opaqueRegister(ctx, a.tr, "/v1/password/start", nil, newPass, a.St.Username)
	if err != nil {
		return err
	}
	return a.tr.do(ctx, "POST", "/v1/password/finish", nil, map[string]any{"reg_id": regID, "record": record}, nil)
}

// RotateRecoveryKey issues a new recovery key (the old one stops working).
func (a *Account) RotateRecoveryKey(ctx context.Context) (RecoveryKey, error) {
	rk := NewRecoveryKey()
	k := rk.derive()
	pkg, err := sealTo(k.boxPub, a.St.Keybag)
	if err != nil {
		return rk, err
	}
	err = a.tr.do(ctx, "POST", "/v1/recovery/rotate", nil, recoveryInfo{SignPub: k.signPub, BoxPub: k.boxPub, Pkg: pkg}, nil)
	return rk, err
}

// Recover restores access on a fresh device using only the recovery key, then sets a new passphrase.
func Recover(ctx context.Context, serverURL, username string, rk RecoveryKey, newPassphrase, deviceName string, store StateStore, hc *http.Client) (*Account, error) {
	a := &Account{St: newDevice(serverURL, username, deviceName), store: store, hc: hc, tr: newTransport(serverURL, hc)}
	keys := rk.derive()
	var ch struct {
		Nonce string `json:"nonce"`
	}
	if err := a.tr.do(ctx, "POST", "/v1/recovery/challenge", nil, map[string]any{"username": username}, &ch); err != nil {
		return nil, err
	}
	msg := []byte("corvid-sync/v1/recover\x00" + username + "\x00" + ch.Nonce)
	sig := ed25519.Sign(keys.sign, msg)
	var out struct {
		Token string `json:"token"`
		Pkg   []byte `json:"recovery_pkg"`
	}
	if err := a.tr.do(ctx, "POST", "/v1/recovery/login", nil, map[string]any{"username": username, "nonce": ch.Nonce, "sig": sig, "device": a.dev()}, &out); err != nil {
		return nil, err
	}
	kb, err := openSealed(keys.boxPub, keys.boxPriv, out.Pkg)
	if err != nil {
		return nil, err
	}
	a.St.Keybag, a.St.Token, a.St.Approved = kb, out.Token, true
	a.tr.token = out.Token
	if err := a.setPassphrase(ctx, newPassphrase); err != nil {
		return nil, err
	}
	return a, a.save()
}

// Stats returns quota usage.
func (a *Account) Stats(ctx context.Context) (used, quota int64, records int, err error) {
	var s struct {
		Used    int64 `json:"used_bytes"`
		Quota   int64 `json:"quota_bytes"`
		Records int   `json:"records"`
	}
	err = a.tr.do(ctx, "GET", "/v1/stats", nil, nil, &s)
	return s.Used, s.Quota, s.Records, err
}

// DeleteAccount removes the account and all its data from the server.
func (a *Account) DeleteAccount(ctx context.Context) error {
	return a.tr.do(ctx, "DELETE", "/v1/account", nil, nil, nil)
}

var _ = url.Values{}

// SealKeybag seals a keybag to a device public key (what an approving device sends).
func SealKeybag(pub []byte, kb *Keybag) ([]byte, error) { return sealTo(pub, kb) }
