// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Package httpapi is the Corvid sync server: an HTTP API over SQLite that
// stores encrypted vault objects it cannot read. See sync/protocol/SPEC.md.
package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	MaxObjectBytes  = 16 * 1024 * 1024 // matches the vault format limit
	maxJSONBytes    = 128 * 1024
	maxMessageBytes = 64 * 1024
	maxRevision     = 4096
	maxInviteTTL    = 7 * 24 * time.Hour
)

// Mutable object names. Everything else must be a content address.
var mutableObjects = map[string]bool{"head": true, "roster": true}

type Server struct {
	DB         *DB
	QuotaBytes int64
	Log        *log.Logger
}

func (s *Server) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /v1/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	m.HandleFunc("POST /v1/register", s.register)
	m.HandleFunc("GET /v1/me", s.auth(s.me))
	m.HandleFunc("GET /v1/devices", s.auth(s.devices))
	m.HandleFunc("DELETE /v1/devices/{id}", s.auth(s.revoke))
	m.HandleFunc("POST /v1/invites", s.auth(s.invite))
	m.HandleFunc("GET /v1/vaults", s.auth(s.vaults))
	m.HandleFunc("PUT /v1/vaults/{uuid}", s.auth(s.putVault))
	m.HandleFunc("DELETE /v1/vaults/{uuid}", s.auth(s.deleteVault))
	m.HandleFunc("GET /v1/vaults/{uuid}/objects/{id}", s.auth(s.readObject))
	m.HandleFunc("PUT /v1/vaults/{uuid}/objects/{id}", s.auth(s.writeObject))
	m.HandleFunc("POST /v1/vaults/{uuid}/collect", s.auth(s.collect))
	m.HandleFunc("POST /v1/messages", s.auth(s.postMessage))
	m.HandleFunc("GET /v1/messages", s.auth(s.messages))
	m.HandleFunc("DELETE /v1/messages/{id}", s.auth(s.deleteMessage))
	return m
}

type apiError struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, apiError{code, msg})
}

func (s *Server) failErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errNotFound):
		fail(w, 404, "not_found", "")
	case errors.Is(err, errConflict):
		fail(w, 412, "conflict", "the object changed or already exists")
	case errors.Is(err, errQuota):
		fail(w, 507, "quota_exceeded", "")
	case errors.Is(err, errTokenInvalid):
		fail(w, 403, "token_invalid", err.Error())
	default:
		if s.Log != nil {
			s.Log.Printf("internal error: %v", err)
		}
		fail(w, 500, "internal", "")
	}
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxJSONBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		fail(w, 400, "invalid", "bad JSON: "+err.Error())
		return false
	}
	return true
}

type authedHandler func(http.ResponseWriter, *http.Request, *Device)

func (s *Server) auth(h authedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || secret == "" {
			fail(w, 401, "unauthorized", "missing bearer token")
			return
		}
		dev, err := s.DB.Authenticate(secret)
		switch {
		case errors.Is(err, errRevoked):
			fail(w, 401, "device_revoked", "this device was removed from the account")
			return
		case errors.Is(err, errUnauthorized):
			fail(w, 401, "unauthorized", "unknown device")
			return
		case err != nil:
			s.failErr(w, err)
			return
		}
		h(w, r, dev)
	}
}

func validUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i := 0; i < 36; i++ {
		c := s[i]
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
		} else if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

func validDigestID(s string) bool {
	if len(s) != 64 {
		return false
	}
	for i := 0; i < 64; i++ {
		if c := s[i]; !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

func validName(s string) bool { return s != "" && len(s) <= 200 && !strings.ContainsAny(s, "\x00\r\n") }

type registerReq struct {
	Token     string `json:"token"`
	Name      string `json:"name"`
	PublicKey []byte `json:"public_key"`
}

type registerResp struct {
	Account      string `json:"account"`
	DeviceID     string `json:"device_id"`
	DeviceSecret string `json:"device_secret"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if !readJSON(w, r, &req) {
		return
	}
	if !validName(req.Name) || len(req.PublicKey) != 32 || req.Token == "" {
		fail(w, 400, "invalid", "need token, name and a 32-byte X25519 public_key")
		return
	}
	dev, secret, err := s.DB.Register(req.Token, req.Name, req.PublicKey)
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, 201, registerResp{dev.Account, dev.ID, secret})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, d *Device) {
	writeJSON(w, 200, map[string]string{"device_id": d.ID, "account": d.Account, "name": d.Name})
}

func (s *Server) devices(w http.ResponseWriter, r *http.Request, d *Device) {
	list, err := s.DB.Devices(d.AccountID)
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"devices": list})
}

func (s *Server) revoke(w http.ResponseWriter, r *http.Request, d *Device) {
	if err := s.DB.Revoke(d.AccountID, r.PathValue("id")); err != nil {
		s.failErr(w, err)
		return
	}
	w.WriteHeader(204)
}

func (s *Server) invite(w http.ResponseWriter, r *http.Request, d *Device) {
	var req struct {
		TTLSeconds int64 `json:"ttl_seconds"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	ttl := time.Duration(req.TTLSeconds) * time.Second
	if ttl <= 0 || ttl > maxInviteTTL {
		fail(w, 400, "invalid", "ttl_seconds must be 1..604800")
		return
	}
	tok, exp, err := s.DB.createTokenFor(d.AccountID, ttl, d.ID)
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"token": tok, "expires": exp.Unix()})
}

func (s *Server) vaults(w http.ResponseWriter, r *http.Request, d *Device) {
	list, err := s.DB.Vaults(d.AccountID)
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"vaults": list})
}

func (s *Server) putVault(w http.ResponseWriter, r *http.Request, d *Device) {
	uuid := r.PathValue("uuid")
	var req struct {
		DisplayName string `json:"display_name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !validUUID(uuid) || !validName(req.DisplayName) {
		fail(w, 400, "invalid", "need a lowercase UUID and a display_name")
		return
	}
	created, err := s.DB.PutVault(d.AccountID, uuid, req.DisplayName)
	if err != nil {
		s.failErr(w, err)
		return
	}
	status := 200
	if created {
		status = 201
	}
	writeJSON(w, status, VaultInfo{uuid, req.DisplayName})
}

func (s *Server) deleteVault(w http.ResponseWriter, r *http.Request, d *Device) {
	if err := s.DB.DeleteVault(d.AccountID, r.PathValue("uuid")); err != nil {
		s.failErr(w, err)
		return
	}
	w.WriteHeader(204)
}

func objectPath(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	uuid, id := r.PathValue("uuid"), r.PathValue("id")
	if !validUUID(uuid) || !(mutableObjects[id] || validDigestID(id)) {
		fail(w, 400, "invalid", "unknown object name")
		return "", "", false
	}
	return uuid, id, true
}

func (s *Server) readObject(w http.ResponseWriter, r *http.Request, d *Device) {
	uuid, id, ok := objectPath(w, r)
	if !ok {
		return
	}
	obj, err := s.DB.ReadObject(d.AccountID, uuid, id)
	if err != nil {
		s.failErr(w, err)
		return
	}
	if obj == nil {
		fail(w, 404, "no_object", "no such object")
		return
	}
	if max := r.URL.Query().Get("max_bytes"); max != "" {
		if n, err := strconv.Atoi(max); err == nil && len(obj.Data) > n {
			fail(w, 413, "too_large", "object is larger than max_bytes")
			return
		}
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("ETag", `"`+obj.Revision+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.Write(obj.Data)
}

func unquote(etag string) string {
	if len(etag) >= 2 && etag[0] == '"' && etag[len(etag)-1] == '"' {
		return etag[1 : len(etag)-1]
	}
	return etag
}

func (s *Server) writeObject(w http.ResponseWriter, r *http.Request, d *Device) {
	uuid, id, ok := objectPath(w, r)
	if !ok {
		return
	}
	ifMatch, ifNone := r.Header.Get("If-Match"), r.Header.Get("If-None-Match")
	var expected *string
	switch {
	case ifNone == "*" && ifMatch == "":
	case ifMatch != "" && ifNone == "":
		rev := unquote(ifMatch)
		if rev == "" || len(rev) > maxRevision {
			fail(w, 400, "invalid", "bad If-Match")
			return
		}
		expected = &rev
	default:
		fail(w, 428, "precondition_required", "send exactly one of If-None-Match: * or If-Match")
		return
	}
	var epoch *uint32
	if v := r.Header.Get("X-Retention-Epoch"); v != "" {
		n, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			fail(w, 400, "invalid", "bad X-Retention-Epoch")
			return
		}
		e := uint32(n)
		epoch = &e
	}
	immutable := !mutableObjects[id]
	if immutable && (expected != nil || epoch == nil) {
		fail(w, 400, "invalid", "content-addressed objects are create-only and need X-Retention-Epoch")
		return
	}
	if !immutable && epoch != nil {
		fail(w, 400, "invalid", "X-Retention-Epoch is only for content-addressed objects")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxObjectBytes))
	if err != nil {
		fail(w, 413, "too_large", "object over 16 MiB")
		return
	}
	if len(data) == 0 {
		fail(w, 400, "invalid", "empty object")
		return
	}
	if immutable {
		sum := sha256.Sum256(data)
		if hex.EncodeToString(sum[:]) != id {
			fail(w, 400, "invalid", "object name is not the SHA-256 of its body")
			return
		}
	}
	rev, err := s.DB.WriteObject(d.AccountID, uuid, id, expected, data, epoch, s.QuotaBytes)
	if err != nil {
		s.failErr(w, err)
		return
	}
	w.Header().Set("ETag", `"`+rev+`"`)
	writeJSON(w, 201, map[string]string{"revision": rev})
}

func (s *Server) collect(w http.ResponseWriter, r *http.Request, d *Device) {
	var req struct {
		MinimumRetainedEpoch uint32 `json:"minimum_retained_epoch"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	n, err := s.DB.Collect(d.AccountID, r.PathValue("uuid"), req.MinimumRetainedEpoch)
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]int64{"deleted": n})
}

func (s *Server) postMessage(w http.ResponseWriter, r *http.Request, d *Device) {
	var req struct {
		ToDevice string `json:"to_device"`
		Kind     string `json:"kind"`
		Data     []byte `json:"data"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.Kind == "" || len(req.Kind) > 64 || len(req.Data) == 0 || len(req.Data) > maxMessageBytes {
		fail(w, 400, "invalid", "need kind and 1..65536 bytes of data")
		return
	}
	id, err := s.DB.PostMessage(d.AccountID, d.ID, req.ToDevice, req.Kind, req.Data)
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, 201, map[string]int64{"id": id})
}

func (s *Server) messages(w http.ResponseWriter, r *http.Request, d *Device) {
	list, err := s.DB.Messages(d.ID)
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"messages": list})
}

func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request, d *Device) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		fail(w, 400, "invalid", "bad id")
		return
	}
	if err := s.DB.DeleteMessage(d.ID, id); err != nil {
		s.failErr(w, err)
		return
	}
	w.WriteHeader(204)
}
