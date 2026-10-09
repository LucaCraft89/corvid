package syncclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// APIError is a non-2xx server answer.
type APIError struct {
	Status int
	Code   string
}

func (e *APIError) Error() string { return fmt.Sprintf("sync server: %d %s", e.Status, e.Code) }

// Is lets callers test errors.Is(err, ErrResync) etc.
func (e *APIError) Is(target error) bool {
	if t, ok := target.(*APIError); ok {
		return t.Status == e.Status && (t.Code == "" || t.Code == e.Code)
	}
	return false
}

// Sentinels for common server answers.
var (
	ErrUnauthorized = &APIError{Status: 401}
	ErrRateLimited  = &APIError{Status: 429}
	ErrResync       = &APIError{Status: 410, Code: "resync_required"}
)

// Wire types (duplicated from the server module on purpose: the client must
// not import server code; the acceptance tests check compatibility).
type deviceInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Pub  []byte `json:"pub"`
}

type recoveryInfo struct {
	SignPub []byte `json:"sign_pub"`
	BoxPub  []byte `json:"box_pub"`
	Pkg     []byte `json:"pkg"`
}

type wireRecord struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
	Epoch      int    `json:"epoch"`
	Blob       []byte `json:"blob"`
	Deleted    bool   `json:"deleted"`
	BaseSeq    int64  `json:"base_seq,omitempty"`
	Seq        int64  `json:"seq,omitempty"`
}

// DeviceEntry is a device as listed by the server.
type DeviceEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Pub         []byte `json:"pub"`
	State       string `json:"state"`
	CreatedAt   int64  `json:"created_at"`
	LastSeen    int64  `json:"last_seen"`
	Self        bool   `json:"self"`
	Fingerprint string `json:"-"`
}

// transport is a tiny JSON-over-HTTP client.
type transport struct {
	base  string
	hc    *http.Client
	token string
}

func newTransport(base string, hc *http.Client) *transport {
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	return &transport{base: strings.TrimRight(base, "/"), hc: hc}
}

func (t *transport) do(ctx context.Context, method, path string, q url.Values, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	u := t.base + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, u, body)
	if err != nil {
		return err
	}
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if t.token != "" {
		req.Header.Set("Authorization", "Bearer "+t.token)
	}
	resp, err := t.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode/100 != 2 {
		var e struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &e)
		return &APIError{Status: resp.StatusCode, Code: e.Error}
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}
