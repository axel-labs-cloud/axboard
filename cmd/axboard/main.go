package main

import (
	"context"
	"errors"
	"flag"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/api"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/health"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/state"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/web"
)

func main() {
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
	broadcaster := api.NewBroadcaster()
	// No per-status SSE: the client polls /api/apps/status on a 15s interval
	// (a deliberate design choice), so broadcasting on every status flip would
	// be wasted fan-out with no consumer.

	server := api.NewServer(*configPath, store, pool, broadcaster)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

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
	cancel()
	slog.Info("axboard stopped")
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
