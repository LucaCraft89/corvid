// Package syncserver implements the Corvid self-hosted E2EE sync server.
// It stores only ciphertext and minimal metadata (see docs/security/sync.md).
package syncserver

import "time"

// Registration modes.
const (
	RegOpen   = "open"
	RegClosed = "closed"
	RegToken  = "token"
)

// Config holds all server settings. Zero values are replaced by defaults in Normalize.
type Config struct {
	DBPath       string // SQLite file path. ":memory:" is not supported (multi-connection).
	KeyFile      string // OPAQUE long-term key material (0600), created on first start.
	Registration string // open | closed | token
	RegToken     string // required when Registration == token (unless AdminToken is set: invites)
	AdminToken   string // enables the optional admin UI/API at /admin; empty = OFF

	MaxBodyBytes   int64 // request body cap
	MaxRecordBytes int   // single record blob cap
	MaxBatch       int   // records per push
	QuotaBytes     int64 // per-account stored blob bytes
	MaxRecords     int   // per-account record count
	MaxDevices     int   // per-account devices (non-revoked)
	TombstoneKeep  time.Duration
	SessionTTL     time.Duration
	TrustProxy     bool // honour X-Forwarded-For (only behind a trusted reverse proxy)
	GeneralPerMin  int  // per-IP requests/min (all routes)
	AuthPerMin     int  // per-IP requests/min on unauthenticated auth routes
	LoginFailLimit int  // failures before per-username backoff starts
	Now            func() time.Time
}

// Normalize fills defaults.
func (c *Config) Normalize() {
	if c.Registration == "" {
		c.Registration = RegToken
	}
	if c.MaxBodyBytes == 0 {
		c.MaxBodyBytes = 2 << 20
	}
	if c.QuotaBytes == 0 {
		c.QuotaBytes = 100 << 20
	}
	if c.MaxRecordBytes == 0 {
		c.MaxRecordBytes = 256 << 10
	}
	if c.MaxBatch == 0 {
		c.MaxBatch = 200
	}
	if c.MaxRecords == 0 {
		c.MaxRecords = 200000
	}
	if c.MaxDevices == 0 {
		c.MaxDevices = 20
	}
	if c.TombstoneKeep == 0 {
		c.TombstoneKeep = 90 * 24 * time.Hour
	}
	if c.SessionTTL == 0 {
		c.SessionTTL = 30 * 24 * time.Hour
	}
	if c.GeneralPerMin == 0 {
		c.GeneralPerMin = 600
	}
	if c.AuthPerMin == 0 {
		c.AuthPerMin = 30
	}
	if c.LoginFailLimit == 0 {
		c.LoginFailLimit = 5
	}
	if c.Now == nil {
		c.Now = time.Now
	}
}
