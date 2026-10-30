// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// corvid-sync-server stores end-to-end encrypted Corvid sync vaults.
//
//	corvid-sync-server serve  --db sync.db [--listen :8443] [--tls-cert F --tls-key F] [--quota-mb 1024]
//	corvid-sync-server token  --db sync.db --account NAME [--ttl 24h]
//	corvid-sync-server devices --db sync.db --account NAME
//	corvid-sync-server revoke --db sync.db --device ID
//	corvid-sync-server version
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lucacraft89/corvid/sync/server/httpapi"
)

var version = "0.1.0-dev"

func usage() {
	fmt.Fprintln(os.Stderr, `usage: corvid-sync-server <command> [flags]
commands:
  serve    run the server
  token    create a one-time registration token for an account
  devices  list the devices of an account
  revoke   revoke a device
  version  print the version
Run "corvid-sync-server <command> -h" for flags.`)
	os.Exit(2)
}

func openDB(fs *flag.FlagSet, path string) *httpapi.DB {
	if path == "" {
		fs.Usage()
		os.Exit(2)
	}
	db, err := httpapi.OpenDB(path)
	if err != nil {
		log.Fatalf("open %s: %v", path, err)
	}
	return db
}

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	if len(os.Args) < 2 {
		usage()
	}
	cmd, args := os.Args[1], os.Args[2:]
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	dbPath := fs.String("db", os.Getenv("CORVID_SYNC_DB"), "SQLite database file (env CORVID_SYNC_DB)")
	switch cmd {
	case "serve":
		listen := fs.String("listen", "127.0.0.1:8443", "address to listen on")
		cert := fs.String("tls-cert", "", "TLS certificate (PEM); without it, serve plain HTTP behind a TLS proxy")
		key := fs.String("tls-key", "", "TLS private key (PEM)")
		quota := fs.Int64("quota-mb", 1024, "storage quota per account in MiB")
		fs.Parse(args)
		db := openDB(fs, *dbPath)
		defer db.Close()
		srv := &http.Server{
			Addr:              *listen,
			Handler:           (&httpapi.Server{DB: db, QuotaBytes: *quota << 20, Log: log.Default()}).Handler(),
			ReadHeaderTimeout: 10 * time.Second,
			ReadTimeout:       5 * time.Minute,
			WriteTimeout:      5 * time.Minute,
			IdleTimeout:       2 * time.Minute,
		}
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		go func() {
			<-ctx.Done()
			sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			srv.Shutdown(sctx)
		}()
		log.Printf("corvid-sync-server %s listening on %s (tls=%v)", version, *listen, *cert != "")
		var err error
		if *cert != "" {
			err = srv.ListenAndServeTLS(*cert, *key)
		} else {
			err = srv.ListenAndServe()
		}
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	case "token":
		account := fs.String("account", "", "account name (created if new)")
		ttl := fs.Duration("ttl", 24*time.Hour, "how long the token stays valid")
		fs.Parse(args)
		db := openDB(fs, *dbPath)
		defer db.Close()
		tok, exp, err := db.CreateToken(*account, *ttl, "admin")
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%s\n(valid once, until %s)\n", tok, exp.UTC().Format(time.RFC3339))
	case "devices":
		account := fs.String("account", "", "account name")
		fs.Parse(args)
		db := openDB(fs, *dbPath)
		defer db.Close()
		list, err := db.DevicesByAccountName(*account)
		if err != nil {
			log.Fatal(err)
		}
		for _, d := range list {
			state := "active"
			if d.Revoked != nil {
				state = "revoked " + time.Unix(*d.Revoked, 0).UTC().Format(time.RFC3339)
			}
			fmt.Printf("%s\t%s\tlast seen %s\t%s\n", d.ID, d.Name, time.Unix(d.LastSeen, 0).UTC().Format(time.RFC3339), state)
		}
	case "revoke":
		device := fs.String("device", "", "device ID")
		fs.Parse(args)
		db := openDB(fs, *dbPath)
		defer db.Close()
		if err := db.Revoke(-1, *device); err != nil {
			log.Fatal(err)
		}
		fmt.Println("revoked", *device)
	case "version":
		fmt.Println("corvid-sync-server", version)
	default:
		usage()
	}
}
