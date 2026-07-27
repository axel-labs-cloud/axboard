package api

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/discover"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/health"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/state"
)

// maxBodyBytes caps PUT /api/config and /api/state request bodies. Both files
// are tiny in practice; this just stops a malformed/huge upload from being
// buffered into memory.
const maxBodyBytes = 8 << 20 // 8 MiB

// Server holds the runtime references the HTTP handlers need.
type Server struct {
	configMu  sync.RWMutex
	config    *config.Config
	configErr atomic.Value // *ConfigErrorJS, nil-able

	configPath string

	State     *state.Store
	Health    *health.Pool
	Broadcast *Broadcaster
}

func NewServer(configPath string, st *state.Store, hp *health.Pool, b *Broadcaster) *Server {
	return &Server{
		configPath: configPath,
		State:      st,
		Health:     hp,
		Broadcast:  b,
	}
}

// SetConfig is called by the config watcher on every successful reload.
func (s *Server) SetConfig(c *config.Config) {
	s.configMu.Lock()
	s.config = c
	s.configMu.Unlock()
	s.configErr.Store((*ConfigErrorJS)(nil))
}

// SetConfigError is called when a YAML save can't be parsed. The last-good
// config keeps serving from GetConfig().
func (s *Server) SetConfigError(err error) {
	if err == nil {
		s.configErr.Store((*ConfigErrorJS)(nil))
		return
	}
	ce := &ConfigErrorJS{Message: err.Error()}
	if lerr, ok := err.(*config.LoadError); ok {
		ce.Message = lerr.Message
		ce.Line = lerr.Line
		ce.Column = lerr.Column
	}
	s.configErr.Store(ce)
}

// GetConfigError returns the last parse error if config is in a broken state.
func (s *Server) GetConfigError() *ConfigErrorJS {
	v := s.configErr.Load()
	if v == nil {
		return nil
	}
	return v.(*ConfigErrorJS)
}

func (s *Server) getConfig() *config.Config {
	s.configMu.RLock()
	defer s.configMu.RUnlock()
	return s.config
}

// SnapshotConfig returns the currently-loaded config. Returns nil if no
// successful load has happened yet. Safe for concurrent use.
func (s *Server) SnapshotConfig() *config.Config {
	return s.getConfig()
}

// Router builds the chi mux. spaFS is the embedded built frontend; pass nil
// in dev (Vite handles the SPA on its own port).
func (s *Server) Router(spaFS fs.FS) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(loggerMW)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Prometheus scrape endpoint (root path per convention). Exposes app
	// liveness so a real monitoring stack can alert on it — axboard stays a
	// dashboard, not a metrics store.
	r.Get("/metrics", s.handleMetrics)

	r.Route("/api", func(r chi.Router) {
		r.Get("/config", s.handleGetConfig)
		r.Put("/config", s.handlePutConfig)
		r.Get("/config/raw", s.handleGetRawConfig)
		r.Put("/config/raw", s.handlePutRawConfig)
		r.Get("/state", s.handleGetState)
		r.Put("/state", s.handlePutState)
		r.Get("/apps/status", s.handleStatus)
		r.Get("/apps/history", s.handleHistory)
		r.Get("/discover", s.handleDiscover)
		r.Post("/apps/{id}/check", s.handleForceCheck)
		r.Get("/events", s.handleSSE)
	})

	if spaFS != nil {
		r.NotFound(spaHandler(spaFS))
	}

	return r
}

// dashboardOut is the per-dashboard shape the frontend reads. Widgets carry
// ONLY their config.yaml base config — state.yaml overrides are merged in
// client-side by assembleLayout(). The server used to merge overrides here,
// but that meant every UI write-back of the ["config"] cache (add widget,
// manage services, dashboard CRUD) baked state-derived values into the human
// config.yaml. Keeping this response raw makes config.yaml the sole source of
// truth for widget base config.
type dashboardOut struct {
	ID      string      `json:"id"`
	Name    string      `json:"name"`
	Default bool        `json:"default,omitempty"`
	Accent  string      `json:"accent,omitempty"`
	Widgets []widgetOut `json:"widgets,omitempty"`
}

type widgetOut struct {
	I      string         `json:"i"`
	Type   string         `json:"type"`
	Title  string         `json:"title"`
	Config map[string]any `json:"config,omitempty"`
}

type configOut struct {
	Server     config.ServerConfig `json:"server"`
	Apps       []config.App        `json:"apps,omitempty"`
	Groups     []config.Group      `json:"groups,omitempty"`
	Dashboards []dashboardOut      `json:"dashboards,omitempty"`
}

func (s *Server) handleGetConfig(w http.ResponseWriter, _ *http.Request) {
	c := s.getConfig()
	if c == nil {
		writeJSON(w, http.StatusOK, configOut{})
		return
	}
	out := configOut{
		Server:     c.Server,
		Apps:       c.Apps,
		Groups:     c.Groups,
		Dashboards: make([]dashboardOut, 0, len(c.Dashboards)),
	}
	for _, d := range c.Dashboards {
		do := dashboardOut{
			ID:      d.ID,
			Name:    d.Name,
			Default: d.Default,
			Accent:  d.Accent,
			Widgets: make([]widgetOut, 0, len(d.Widgets)),
		}
		for _, w := range d.Widgets {
			do.Widgets = append(do.Widgets, widgetOut{
				I:      w.ID,
				Type:   w.Type,
				Title:  w.Title,
				Config: w.Config, // base only; state overrides merged client-side
			})
		}
		out.Dashboards = append(out.Dashboards, do)
	}
	writeJSON(w, http.StatusOK, out)
}

// handlePutConfig writes the (incoming) config back to config.yaml. This is
// the only path that ever mutates the human file; it WILL drop comments and
// reformat. The frontend warns before calling this.
func (s *Server) handlePutConfig(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	var next config.Config
	if err := json.NewDecoder(r.Body).Decode(&next); err != nil {
		writeErr(w, http.StatusBadRequest, "decode: "+err.Error())
		return
	}
	// Validate BEFORE touching disk. Without this an invalid payload (duplicate
	// ids, dangling group ref, unknown health.type, missing name/url) would be
	// persisted, then the watcher would reject it on reload and serve last-good
	// config with a config_error banner — i.e. the on-disk file left broken.
	if err := config.Validate(&next); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := config.Save(s.configPath, &next); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// The watcher will re-load and reconcile; respond with what we just wrote.
	writeJSON(w, http.StatusOK, next)
}

// handleGetRawConfig returns the config.yaml file verbatim so the in-app editor
// can show (and preserve) the actual YAML including comments.
func (s *Server) handleGetRawConfig(w http.ResponseWriter, _ *http.Request) {
	raw, err := os.ReadFile(s.configPath)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

// handlePutRawConfig validates raw YAML and writes it verbatim (comments kept),
// returning 400 with the parse/validation message on failure.
func (s *Server) handlePutRawConfig(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := config.SaveRaw(s.configPath, raw); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleGetState(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.State.Get())
}

func (s *Server) handlePutState(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	var next state.State
	if err := json.NewDecoder(r.Body).Decode(&next); err != nil {
		writeErr(w, http.StatusBadRequest, "decode: "+err.Error())
		return
	}
	if err := s.State.Save(&next); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, &next)
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.Health.Snapshot())
}

func (s *Server) handleHistory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.Health.HistorySnapshot())
}

// handleDiscover returns candidate services from the Docker/Podman socket,
// excluding any URL already present in config.yaml.
func (s *Server) handleDiscover(w http.ResponseWriter, r *http.Request) {
	socket := "/var/run/docker.sock"
	known := map[string]bool{}
	if c := s.getConfig(); c != nil {
		if c.Discovery.DockerSocket != "" {
			socket = c.Discovery.DockerSocket
		}
		for _, a := range c.Apps {
			known[strings.TrimRight(a.URL, "/")] = true
		}
	}
	found, err := discover.FromDockerSocket(r.Context(), socket)
	if err != nil {
		// Not fatal — the UI shows the message so the user can fix the socket.
		writeJSON(w, http.StatusOK, map[string]any{"services": []discover.Service{}, "error": err.Error()})
		return
	}
	fresh := make([]discover.Service, 0, len(found))
	for _, svc := range found {
		if !known[strings.TrimRight(svc.URL, "/")] {
			fresh = append(fresh, svc)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": fresh})
}

// handleMetrics renders app liveness in Prometheus text exposition format.
func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	snap := s.Health.Snapshot()
	var b strings.Builder
	b.WriteString("# HELP axboard_app_up Whether the app's last health check passed (1) or not (0).\n")
	b.WriteString("# TYPE axboard_app_up gauge\n")
	for id, res := range snap {
		up := 0
		if res.Status == health.StatusHealthy {
			up = 1
		}
		fmt.Fprintf(&b, "axboard_app_up{id=%q,status=%q} %d\n", id, res.Status, up)
	}
	b.WriteString("# HELP axboard_app_response_ms Last health-check response time in milliseconds.\n")
	b.WriteString("# TYPE axboard_app_response_ms gauge\n")
	for id, res := range snap {
		fmt.Fprintf(&b, "axboard_app_response_ms{id=%q} %d\n", id, res.ResponseMS)
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(b.String()))
}

func (s *Server) handleForceCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.Health.Force(id)
	// Force is async, so we just acknowledge — the next poll picks up the
	// updated result.
	writeJSON(w, http.StatusAccepted, map[string]string{"id": id, "status": "scheduled"})
}

func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch, unsubscribe := s.Broadcast.Subscribe()
	defer unsubscribe()

	// Emit any pending config error immediately so a refreshed UI gets it.
	if ce := s.GetConfigError(); ce != nil {
		payload, _ := json.Marshal(Event{Type: "config_error", Error: ce})
		fmt.Fprintf(w, "data: %s\n\n", payload)
		flusher.Flush()
	}

	// Keepalive ticker so proxies don't time out the long-lived connection.
	keepalive := time.NewTicker(25 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case payload, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", payload)
			flusher.Flush()
		case <-keepalive.C:
			fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

func writeJSON(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func spaHandler(spa fs.FS) http.HandlerFunc {
	fileServer := http.FileServer(http.FS(spa))
	return func(w http.ResponseWriter, r *http.Request) {
		// /api and /healthz are already handled above.
		if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/healthz" {
			http.NotFound(w, r)
			return
		}
		// Serve the file if it exists; otherwise fall back to index.html so
		// react-router can take over.
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(spa, path); err != nil {
			r2 := *r
			r2.URL.Path = "/"
			fileServer.ServeHTTP(w, &r2)
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}

func loggerMW(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		if !strings.HasPrefix(r.URL.Path, "/api/events") { // SSE is long-lived
			dur := time.Since(start)
			httpLog(r.Method, r.URL.Path, ww.Status(), dur)
		}
	})
}
