// Command corvid-sync runs the self-hosted Corvid E2EE sync server.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"corvid/syncserver/syncserver"
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func main() {
	var (
		addr  = flag.String("addr", env("CORVID_SYNC_ADDR", ":8443"), "listen address (put TLS reverse proxy in front)")
		data  = flag.String("data", env("CORVID_SYNC_DATA", "/data"), "data directory")
		reg   = flag.String("registration", env("CORVID_SYNC_REGISTRATION", "token"), "open | closed | token")
		token = flag.String("registration-token", os.Getenv("CORVID_SYNC_REG_TOKEN"), "invite token when registration=token")
		proxy = flag.Bool("trust-proxy", env("CORVID_SYNC_TRUST_PROXY", "") == "1", "trust X-Forwarded-For (only behind your reverse proxy)")
		quota = flag.Int64("quota-mb", 100, "per-account quota in MiB")
	)
	flag.Parse()
	if err := os.MkdirAll(*data, 0o700); err != nil {
		log.Fatal(err)
	}
	cfg := syncserver.Config{
		DBPath: *data + "/sync.db", KeyFile: *data + "/server-keys.json",
		Registration: *reg, RegToken: *token, TrustProxy: *proxy, QuotaBytes: *quota << 20,
	}
	srv, err := syncserver.New(cfg)
	if err != nil {
		log.Fatalf("start: %v", err)
	}
	defer srv.Close()
	hs := &http.Server{
		Addr: *addr, Handler: srv,
		ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second,
		WriteTimeout: 60 * time.Second, IdleTimeout: 120 * time.Second, MaxHeaderBytes: 16 << 10,
	}
	go func() {
		t := time.NewTicker(6 * time.Hour)
		for range t.C {
			if n, err := srv.Compact(); err != nil {
				log.Printf("compact: %v", err)
			} else if n > 0 {
				log.Printf("compact: purged %d tombstones", n)
			}
		}
	}()
	go func() {
		c := make(chan os.Signal, 1)
		signal.Notify(c, syscall.SIGINT, syscall.SIGTERM)
		<-c
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = hs.Shutdown(ctx)
	}()
	log.Printf("corvid-sync %s listening on %s (registration=%s)", syncserver.Version, *addr, *reg)
	if err := hs.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
