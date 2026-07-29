package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/term"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/alert"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/api"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/auth"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/health"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/state"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/web"
)

func main() {
	// Subcommands run before flag parsing. `axboard passwd` prints an argon2id
	// hash to paste under server.auth.users[].password_hash.
	if len(os.Args) > 1 && os.Args[1] == "passwd" {
		if err := runPasswd(); err != nil {
			slog.Error("passwd failed", "err", err)
			os.Exit(1)
		}
		return
	}

	configPath := flag.String("config", "config.yaml", "path to config.yaml")
	statePath := flag.String("state", "state.yaml", "path to state.yaml")
	addr := flag.String("addr", "", "listen address (overrides server.bind from config)")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	store := state.New(*statePath)
	if err := store.Load(); err != nil {
		slog.Warn("state load failed (continuing with empty state)", "err", err)
	}

	pool := health.NewPool()
	// Disk-backed uptime history (24h/7d/30d) next to state.yaml (persistent
	// volume), so windowed uptime survives restarts.
	pool.EnableUptime(filepath.Join(filepath.Dir(*statePath), "uptime.json"))
	broadcaster := api.NewBroadcaster()

	// Optional outbound alerting: fan a down/recovered transition out to every
	// configured channel (webhook / ntfy / Telegram / email). Config is
	// refreshed on every reload; sends are best-effort off the health pool.
	notifier := alert.New()
	pool.OnChange(func(id string, prev, cur health.Status) {
		now := time.Now()
		if notifier.Paused(now) { // maintenance window — hold notifications
			return
		}
		notifier.Notify(id, string(prev), string(cur), now)
	})
	// On every check: re-send "down" alerts on the resend interval, and alert on
	// near-expiry certs (both deduped inside the notifier).
	pool.OnResult(func(id string, res health.Result) {
		now := time.Now()
		if notifier.Paused(now) {
			return
		}
		notifier.MaybeResend(id, string(res.Status), now)
		if !res.CertExpiry.IsZero() {
			days := int(res.CertExpiry.Sub(now).Hours() / 24)
			notifier.NotifyCert(id, days, now.Format("2006-01-02"))
		}
	})

	// Uploaded icons live next to state.yaml (machine-owned, persisted volume).
	iconsDir := filepath.Join(filepath.Dir(*statePath), "icons")
	if err := os.MkdirAll(iconsDir, 0o755); err != nil {
		slog.Warn("could not create icons dir", "dir", iconsDir, "err", err)
	}

	server := api.NewServer(*configPath, iconsDir, store, pool, broadcaster)

	// Optional built-in auth. The HMAC session secret lives in its own file next
	// to state.yaml (persisted volume) so the UI's state round-trip can't clobber
	// it and sessions survive restarts. Login stays disabled until config.yaml
	// declares users, so enabling here unconditionally is safe.
	secret, err := auth.LoadOrCreateSecret(filepath.Join(filepath.Dir(*statePath), "session.key"))
	if err != nil {
		slog.Error("could not load/create session secret", "err", err)
		os.Exit(1)
	}
	server.EnableAuth(secret)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Persist uptime buckets periodically so a crash loses at most a few minutes.
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := pool.SaveUptime(); err != nil {
					slog.Warn("uptime save failed", "err", err)
				}
			}
		}
	}()

	// Watch config: every (re)load triggers a health-pool reconcile and an SSE
	// broadcast. Parse errors keep the last-good config serving but flip the
	// banner via SSE.
	if err := config.Watch(ctx, *configPath, 250*time.Millisecond, func(ev config.WatchEvent) {
		if ev.Err != nil {
			slog.Warn("config load error", "err", ev.Err)
			server.SetConfigError(ev.Err)
			broadcaster.Send(api.Event{
				Type:  "config_error",
				Error: &api.ConfigErrorJS{Message: ev.Err.Error()},
			})
			return
		}
		server.SetConfig(ev.Config)
		notifier.SetConfig(ev.Config.Alerts)
		pool.Reconcile(ev.Config.Apps)
		broadcaster.Send(api.Event{Type: "config_changed"})
		slog.Info("config loaded",
			"apps", len(ev.Config.Apps),
			"groups", len(ev.Config.Groups),
			"dashboards", len(ev.Config.Dashboards),
		)
	}); err != nil {
		slog.Error("config watcher failed to start", "err", err)
		os.Exit(1)
	}

	// Resolve listen address: --addr flag wins, else config.server.bind, else :8080.
	bind := *addr
	if bind == "" {
		if cfg := serverConfig(server); cfg != nil && cfg.Bind != "" {
			bind = cfg.Bind
		}
	}
	if bind == "" {
		bind = ":8080"
	}

	var spaFS fs.FS
	if web.HasIndex() {
		spaFS, _ = web.Dist()
		slog.Info("serving embedded SPA")
	} else {
		slog.Info("no embedded SPA — assuming Vite dev server")
	}

	httpServer := &http.Server{
		Addr:              bind,
		Handler:           server.Router(spaFS),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("axboard listening", "addr", bind)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server exited", "err", err)
			cancel()
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	select {
	case sig := <-sigCh:
		slog.Info("signal received, shutting down", "sig", sig)
	case <-ctx.Done():
		slog.Info("context cancelled, shutting down")
	}

	// Close SSE subscribers first so their long-lived handlers return, letting
	// http.Server.Shutdown drain quickly instead of blocking to the deadline.
	broadcaster.Close()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Warn("http shutdown error", "err", err)
	}
	pool.Stop()
	if err := pool.SaveUptime(); err != nil {
		slog.Warn("uptime save failed", "err", err)
	}
	cancel()
	slog.Info("axboard stopped")
}

// runPasswd generates an argon2id hash for a password read from the terminal
// (no echo, with confirmation) or from stdin when piped, and prints a ready-to-
// paste config.yaml snippet. Usage: `axboard passwd [username]`.
func runPasswd() error {
	username := "admin"
	if len(os.Args) > 2 && os.Args[2] != "" {
		username = os.Args[2]
	}

	var pw string
	if term.IsTerminal(int(os.Stdin.Fd())) {
		fmt.Fprint(os.Stderr, "Password: ")
		b1, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if err != nil {
			return err
		}
		fmt.Fprint(os.Stderr, "Confirm:  ")
		b2, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if err != nil {
			return err
		}
		if string(b1) != string(b2) {
			return fmt.Errorf("passwords do not match")
		}
		pw = string(b1)
	} else {
		line, err := bufio.NewReader(os.Stdin).ReadString('\n')
		if err != nil && line == "" {
			return err
		}
		pw = strings.TrimRight(line, "\r\n")
	}
	if len(pw) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}

	hash, err := auth.HashPassword(pw)
	if err != nil {
		return err
	}
	// Snippet to stdout so it can be redirected/copied; prompts went to stderr.
	fmt.Printf("server:\n  auth:\n    users:\n      - username: %s\n        password_hash: \"%s\"\n", username, hash)
	return nil
}

// serverConfig pokes at the server to grab the live config for bind-address
// resolution. main only needs it during boot.
func serverConfig(s *api.Server) *config.ServerConfig {
	// Trigger one synchronous read by re-loading from disk (the watcher's
	// goroutine may not have run yet).
	cfg := s.SnapshotConfig()
	if cfg == nil {
		return nil
	}
	return &cfg.Server
}
