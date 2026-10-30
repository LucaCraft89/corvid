// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tokens(
  hash BLOB PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL,
  used INTEGER,
  created_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devices(
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key BLOB NOT NULL,
  secret_hash BLOB UNIQUE NOT NULL,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked INTEGER);
CREATE TABLE IF NOT EXISTS vaults(
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY(account_id, uuid));
CREATE TABLE IF NOT EXISTS objects(
  account_id INTEGER NOT NULL,
  vault_uuid TEXT NOT NULL,
  object_id TEXT NOT NULL,
  data BLOB NOT NULL,
  revision TEXT NOT NULL,
  retention_epoch INTEGER,
  updated INTEGER NOT NULL,
  PRIMARY KEY(account_id, vault_uuid, object_id),
  FOREIGN KEY(account_id, vault_uuid) REFERENCES vaults(account_id, uuid) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_device TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  from_device TEXT NOT NULL,
  kind TEXT NOT NULL,
  data BLOB NOT NULL,
  created INTEGER NOT NULL);
`

// DB is the server's SQLite store. One connection: SQLite serializes writes
// anyway, and it makes every conditional write trivially atomic.
type DB struct {
	sql *sql.DB
	now func() time.Time
}

func OpenDB(path string) (*DB, error) {
	d, err := sql.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	d.SetMaxOpenConns(1)
	if _, err := d.Exec(schema); err != nil {
		d.Close()
		return nil, fmt.Errorf("schema: %w", err)
	}
	return &DB{sql: d, now: time.Now}, nil
}

func (d *DB) Close() error { return d.sql.Close() }

func randomSecret() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashSecret(s string) []byte {
	h := sha256.Sum256([]byte(s))
	return h[:]
}

func newDeviceID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return "dev_" + hex.EncodeToString(b)
}

// CreateToken makes a one-time registration token for account (created if
// missing). createdBy is "admin" or a device ID.
func (d *DB) CreateToken(account string, ttl time.Duration, createdBy string) (string, time.Time, error) {
	if account == "" {
		return "", time.Time{}, errors.New("account name required")
	}
	now := d.now()
	if _, err := d.sql.Exec(`INSERT OR IGNORE INTO accounts(name, created) VALUES(?, ?)`, account, now.Unix()); err != nil {
		return "", time.Time{}, err
	}
	var id int64
	if err := d.sql.QueryRow(`SELECT id FROM accounts WHERE name=?`, account).Scan(&id); err != nil {
		return "", time.Time{}, err
	}
	return d.createTokenFor(id, ttl, createdBy)
}

func (d *DB) createTokenFor(accountID int64, ttl time.Duration, createdBy string) (string, time.Time, error) {
	tok := "reg_" + randomSecret()
	exp := d.now().Add(ttl)
	_, err := d.sql.Exec(`INSERT INTO tokens(hash, account_id, expires, created_by) VALUES(?,?,?,?)`,
		hashSecret(tok), accountID, exp.Unix(), createdBy)
	return tok, exp, err
}

type Device struct {
	ID        string `json:"id"`
	AccountID int64  `json:"-"`
	Account   string `json:"-"`
	Name      string `json:"name"`
	PublicKey []byte `json:"public_key"`
	Created   int64  `json:"created"`
	LastSeen  int64  `json:"last_seen"`
	Revoked   *int64 `json:"revoked,omitempty"`
}

var (
	errTokenInvalid = errors.New("registration token is unknown, used or expired")
	errNotFound     = errors.New("not found")
	errConflict     = errors.New("condition failed")
	errQuota        = errors.New("quota exceeded")
	errRevoked      = errors.New("device revoked")
	errUnauthorized = errors.New("unauthorized")
)

// Register consumes a token and creates a device. Returns the device and its
// bearer secret (only its hash is stored).
func (d *DB) Register(token, name string, pub []byte) (*Device, string, error) {
	tx, err := d.sql.Begin()
	if err != nil {
		return nil, "", err
	}
	defer tx.Rollback()
	now := d.now().Unix()
	var accountID int64
	err = tx.QueryRow(`SELECT account_id FROM tokens WHERE hash=? AND used IS NULL AND expires>?`, hashSecret(token), now).Scan(&accountID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", errTokenInvalid
	} else if err != nil {
		return nil, "", err
	}
	if _, err := tx.Exec(`UPDATE tokens SET used=? WHERE hash=?`, now, hashSecret(token)); err != nil {
		return nil, "", err
	}
	secret := "dsk_" + randomSecret()
	dev := &Device{ID: newDeviceID(), AccountID: accountID, Name: name, PublicKey: pub, Created: now, LastSeen: now}
	if _, err := tx.Exec(`INSERT INTO devices(id, account_id, name, public_key, secret_hash, created, last_seen) VALUES(?,?,?,?,?,?,?)`,
		dev.ID, accountID, name, pub, hashSecret(secret), now, now); err != nil {
		return nil, "", err
	}
	if err := tx.QueryRow(`SELECT name FROM accounts WHERE id=?`, accountID).Scan(&dev.Account); err != nil {
		return nil, "", err
	}
	return dev, secret, tx.Commit()
}

func (d *DB) Authenticate(secret string) (*Device, error) {
	dev := &Device{}
	err := d.sql.QueryRow(`SELECT d.id, d.account_id, a.name, d.name, d.public_key, d.created, d.last_seen, d.revoked
		FROM devices d JOIN accounts a ON a.id=d.account_id WHERE d.secret_hash=?`, hashSecret(secret)).
		Scan(&dev.ID, &dev.AccountID, &dev.Account, &dev.Name, &dev.PublicKey, &dev.Created, &dev.LastSeen, &dev.Revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errUnauthorized
	} else if err != nil {
		return nil, err
	}
	if dev.Revoked != nil {
		return nil, errRevoked
	}
	if now := d.now().Unix(); now-dev.LastSeen >= 60 {
		d.sql.Exec(`UPDATE devices SET last_seen=? WHERE id=?`, now, dev.ID)
		dev.LastSeen = now
	}
	return dev, nil
}

func (d *DB) Devices(accountID int64) ([]Device, error) {
	rows, err := d.sql.Query(`SELECT id, name, public_key, created, last_seen, revoked FROM devices WHERE account_id=? ORDER BY created, id`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Device{}
	for rows.Next() {
		var v Device
		if err := rows.Scan(&v.ID, &v.Name, &v.PublicKey, &v.Created, &v.LastSeen, &v.Revoked); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// DevicesByAccountName is for the admin CLI.
func (d *DB) DevicesByAccountName(account string) ([]Device, error) {
	var id int64
	if err := d.sql.QueryRow(`SELECT id FROM accounts WHERE name=?`, account).Scan(&id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	return d.Devices(id)
}

// Revoke marks a device revoked. accountID < 0 means any account (admin).
func (d *DB) Revoke(accountID int64, deviceID string) error {
	q, args := `UPDATE devices SET revoked=? WHERE id=? AND revoked IS NULL`, []any{d.now().Unix(), deviceID}
	if accountID >= 0 {
		q += ` AND account_id=?`
		args = append(args, accountID)
	}
	res, err := d.sql.Exec(q, args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errNotFound
	}
	_, err = d.sql.Exec(`DELETE FROM messages WHERE to_device=?`, deviceID)
	return err
}

type VaultInfo struct {
	UUID        string `json:"vault_uuid"`
	DisplayName string `json:"display_name"`
}

func (d *DB) Vaults(accountID int64) ([]VaultInfo, error) {
	rows, err := d.sql.Query(`SELECT uuid, display_name FROM vaults WHERE account_id=? ORDER BY created, uuid`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []VaultInfo{}
	for rows.Next() {
		var v VaultInfo
		if err := rows.Scan(&v.UUID, &v.DisplayName); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// PutVault creates a vault (idempotent by UUID) or renames it.
func (d *DB) PutVault(accountID int64, uuid, name string) (created bool, err error) {
	res, err := d.sql.Exec(`INSERT OR IGNORE INTO vaults(account_id, uuid, display_name, created) VALUES(?,?,?,?)`, accountID, uuid, name, d.now().Unix())
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n == 1 {
		return true, nil
	}
	_, err = d.sql.Exec(`UPDATE vaults SET display_name=? WHERE account_id=? AND uuid=?`, name, accountID, uuid)
	return false, err
}

func (d *DB) DeleteVault(accountID int64, uuid string) error {
	res, err := d.sql.Exec(`DELETE FROM vaults WHERE account_id=? AND uuid=?`, accountID, uuid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errNotFound
	}
	return nil
}

func (d *DB) vaultExists(q interface {
	QueryRow(string, ...any) *sql.Row
}, accountID int64, uuid string) error {
	var one int
	err := q.QueryRow(`SELECT 1 FROM vaults WHERE account_id=? AND uuid=?`, accountID, uuid).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return errNotFound
	}
	return err
}

type StoredObject struct {
	Data     []byte
	Revision string
}

func (d *DB) ReadObject(accountID int64, vault, id string) (*StoredObject, error) {
	if err := d.vaultExists(d.sql, accountID, vault); err != nil {
		return nil, err
	}
	o := &StoredObject{}
	err := d.sql.QueryRow(`SELECT data, revision FROM objects WHERE account_id=? AND vault_uuid=? AND object_id=?`, accountID, vault, id).Scan(&o.Data, &o.Revision)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return o, err
}

// WriteObject stores data if the condition holds: expected nil means the
// object must be absent, otherwise its revision must equal *expected.
func (d *DB) WriteObject(accountID int64, vault, id string, expected *string, data []byte, epoch *uint32, quota int64) (string, error) {
	tx, err := d.sql.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if err := d.vaultExists(tx, accountID, vault); err != nil {
		return "", err
	}
	var cur string
	var curSize int64
	err = tx.QueryRow(`SELECT revision, length(data) FROM objects WHERE account_id=? AND vault_uuid=? AND object_id=?`, accountID, vault, id).Scan(&cur, &curSize)
	exists := err == nil
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	if (expected == nil && exists) || (expected != nil && (!exists || cur != *expected)) {
		return "", errConflict
	}
	var used int64
	if err := tx.QueryRow(`SELECT COALESCE(SUM(length(data)),0) FROM objects WHERE account_id=?`, accountID).Scan(&used); err != nil {
		return "", err
	}
	if used-curSize+int64(len(data)) > quota {
		return "", errQuota
	}
	revb := make([]byte, 16)
	rand.Read(revb)
	rev := hex.EncodeToString(revb)
	var ep any
	if epoch != nil {
		ep = int64(*epoch)
	}
	if _, err := tx.Exec(`INSERT OR REPLACE INTO objects(account_id, vault_uuid, object_id, data, revision, retention_epoch, updated) VALUES(?,?,?,?,?,?,?)`,
		accountID, vault, id, data, rev, ep, d.now().Unix()); err != nil {
		return "", err
	}
	return rev, tx.Commit()
}

func (d *DB) Collect(accountID int64, vault string, minEpoch uint32) (int64, error) {
	if err := d.vaultExists(d.sql, accountID, vault); err != nil {
		return 0, err
	}
	res, err := d.sql.Exec(`DELETE FROM objects WHERE account_id=? AND vault_uuid=? AND retention_epoch IS NOT NULL AND retention_epoch<?`, accountID, vault, int64(minEpoch))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

type Message struct {
	ID         int64  `json:"id"`
	FromDevice string `json:"from_device"`
	Kind       string `json:"kind"`
	Data       []byte `json:"data"`
	Created    int64  `json:"created"`
}

func (d *DB) PostMessage(accountID int64, from, to, kind string, data []byte) (int64, error) {
	var one int
	err := d.sql.QueryRow(`SELECT 1 FROM devices WHERE id=? AND account_id=? AND revoked IS NULL`, to, accountID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, errNotFound
	} else if err != nil {
		return 0, err
	}
	var n int
	if err := d.sql.QueryRow(`SELECT COUNT(*) FROM messages WHERE to_device=?`, to).Scan(&n); err != nil {
		return 0, err
	}
	if n >= 256 {
		return 0, errQuota
	}
	res, err := d.sql.Exec(`INSERT INTO messages(account_id, to_device, from_device, kind, data, created) VALUES(?,?,?,?,?,?)`, accountID, to, from, kind, data, d.now().Unix())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *DB) Messages(deviceID string) ([]Message, error) {
	rows, err := d.sql.Query(`SELECT id, from_device, kind, data, created FROM messages WHERE to_device=? ORDER BY id`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.FromDevice, &m.Kind, &m.Data, &m.Created); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (d *DB) DeleteMessage(deviceID string, id int64) error {
	res, err := d.sql.Exec(`DELETE FROM messages WHERE id=? AND to_device=?`, id, deviceID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errNotFound
	}
	return nil
}
