package syncserver

import (
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite" // pure-Go SQLite driver (BSD-3)
)

// SchemaVersion is bumped on every migration; see docs/selfhost-sync.md (upgrades).
const SchemaVersion = 1

// Store is the SQLite persistence layer. A Postgres implementation would
// replace this type (not implemented yet; see docs/security/sync.md section 11).
type Store struct {
	db *sql.DB
}

var errNotFound = errors.New("not found")

// OpenStore opens (and migrates) the SQLite database at path.
func OpenStore(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // serialise writers; plenty for a homelab server
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	if _, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`); err != nil {
		return err
	}
	var v string
	err := s.db.QueryRow(`SELECT v FROM meta WHERE k='schema'`).Scan(&v)
	if err == nil {
		if v != fmt.Sprint(SchemaVersion) {
			return fmt.Errorf("database schema %s is not supported by this server (expects %d); see upgrade guide", v, SchemaVersion)
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	_, err = s.db.Exec(`
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  cred_id BLOB NOT NULL,
  opaque_record BLOB NOT NULL,
  wrap_pass BLOB NOT NULL,
  rec_sign_pub BLOB NOT NULL,
  rec_box_pub BLOB NOT NULL,
  rec_pkg BLOB NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL DEFAULT 0,
  used_bytes INTEGER NOT NULL DEFAULT 0,
  rec_count INTEGER NOT NULL DEFAULT 0,
  compacted_before INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE devices (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  pub BLOB NOT NULL,
  state TEXT NOT NULL,
  pkg BLOB,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE TABLE sessions (
  token_hash BLOB PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_acct ON sessions(account_id);
CREATE TABLE records (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  rid TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  blob BLOB NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, collection, rid)
);
CREATE INDEX records_seq ON records(account_id, seq);
INSERT INTO meta(k,v) VALUES('schema','1');`)
	return err
}
