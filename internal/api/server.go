package api

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/alert"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/auth"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/discover"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/health"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/host"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/state"
)

// Build info, injected at link time via -ldflags "-X ...". Defaults to the
// current release when not overridden (e.g. a plain `go build`).
var (
	Version   = "v0.2.0"
	BuildDate = ""
)

// handleVersion reports the build version + date for the UI footer.
func handleVersion(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"version": Version, "buildDate": BuildDate})
}

// maxBodyBytes caps PUT /api/config and /api/state request bodies. Both files
// are tiny in practice; this just stops a malformed/huge upload from being
// buffered into memory.
const maxBodyBytes = 8 << 20 // 8 MiB

// proxyClient serves the RSS/calendar widget fetch proxy. Redirects are
// followed (feeds commonly 301) and the timeout is set per-request via context.
var proxyClient = &http.Client{Timeout: 15 * time.Second}

// pingClient backs the uptime-monitor widget. Self-signed certs are tolerated
// (homelab liveness, not auth).
var pingClient = &http.Client{
	Timeout:   10 * time.Second,
	Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
}

// Server holds the runtime references the HTTP handlers need.
type Server struct {
	configMu  sync.RWMutex
	config    *config.Config
	configErr atomic.Value // *ConfigErrorJS, nil-able

	configPath string
	iconsDir   string

	State     *state.Store
	Health    *health.Pool
	Broadcast *Broadcaster

	// authMgr is non-nil once EnableAuth is called. Auth is only *enforced*
	// when the live config also has ≥1 user (see authActive); dummyHash burns
	// a constant-time verify on unknown usernames to blunt enumeration.
	authMgr   *auth.Manager
	dummyHash string
}

func NewServer(configPath, iconsDir string, st *state.Store, hp *health.Pool, b *Broadcaster) *Server {
	return &Server{
		configPath: configPath,
		iconsDir:   iconsDir,
		State:      st,
		Health:     hp,
		Broadcast:  b,
	}
}

// EnableAuth wires the session manager. Login stays disabled until the config
// declares at least one user, so this is safe to call unconditionally at boot.
func (s *Server) EnableAuth(secret []byte) {
	s.authMgr = auth.NewManager(secret)
	// A throwaway hash to verify against when a username doesn't exist, so a
	// bad-username login costs the same time as a bad-password one.
	if h, err := auth.HashPassword("axboard-nonexistent-user"); err == nil {
		s.dummyHash = h
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
		r.Use(s.apiAuthMW) // gates everything below when auth is active
		r.Get("/version", handleVersion)
		r.Get("/auth", s.handleAuthStatus)
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/logout", s.handleLogout)
		r.Get("/config", s.handleGetConfig)
		r.Put("/config", s.handlePutConfig)
		r.Get("/config/raw", s.handleGetRawConfig)
		r.Put("/config/raw", s.handlePutRawConfig)
		r.Get("/state", s.handleGetState)
		r.Put("/state", s.handlePutState)
		r.Get("/apps/status", s.handleStatus)
		r.Get("/apps/history", s.handleHistory)
		r.Get("/apps/uptime", s.handleUptime)
		r.Get("/discover", s.handleDiscover)
		r.Get("/containers", s.handleContainers)
		r.Post("/containers/{id}/restart", s.handleContainerRestart)
		r.Get("/host", s.handleHost)
		r.Get("/host/procs", s.handleHostProcs)
		r.Post("/wol", s.handleWoL)
		r.Post("/alerts/test", s.handleAlertTest)
		r.Get("/ping", s.handleUptimePing)
		r.Get("/publicip", s.handlePublicIP)
		r.Get("/proxy", s.handleProxy)
		r.Post("/fetch", s.handleFetch) // authenticated outbound proxy for service widgets
		r.Post("/icons", s.handleUploadIcon)
		r.Get("/icons/{name}", s.handleGetIcon)
		r.Post("/apps/{id}/check", s.handleForceCheck)
		r.Get("/push/{id}", s.handlePush) // heartbeat monitor beat (GET for curl/cron)
		r.Post("/push/{id}", s.handlePush)
		r.Get("/events", s.handleSSE)
	})

	// Public, auth-free status pages (server-rendered HTML): default + by slug.
	r.Get("/status", s.handleStatusPage)
	r.Get("/status/badge/{id}", s.handleBadge) // embeddable SVG uptime badge
	r.Get("/status/{slug}", s.handleStatusPage)

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
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	Default    bool               `json:"default,omitempty"`
	Accent     string             `json:"accent,omitempty"`
	Background *config.Background `json:"background,omitempty"`
	Density    string             `json:"density,omitempty"`
	Radius     *int               `json:"radius,omitempty"`
	Widgets    []widgetOut        `json:"widgets,omitempty"`
}

type widgetOut struct {
	I      string         `json:"i"`
	Type   string         `json:"type"`
	Title  string         `json:"title"`
	Config map[string]any `json:"config,omitempty"`
}

type configOut struct {
	Server      config.ServerConfig       `json:"server"`
	Apps        []config.App              `json:"apps,omitempty"`
	Groups      []config.Group            `json:"groups,omitempty"`
	TopBar      *config.TopBar            `json:"topBar,omitempty"`
	Dashboards  []dashboardOut            `json:"dashboards,omitempty"`
	Alerts      config.AlertsConfig       `json:"alerts,omitempty"`
	StatusPages []config.StatusPageConfig `json:"status_pages,omitempty"`
}

func (s *Server) handleGetConfig(w http.ResponseWriter, _ *http.Request) {
	c := s.getConfig()
	if c == nil {
		writeJSON(w, http.StatusOK, configOut{})
		return
	}
	out := configOut{
		Server:      c.Server,
		Apps:        c.Apps,
		Groups:      c.Groups,
		TopBar:      c.TopBar,
		Alerts:      c.Alerts,
		StatusPages: c.StatusPages,
		Dashboards:  make([]dashboardOut, 0, len(c.Dashboards)),
	}
	for _, d := range c.Dashboards {
		do := dashboardOut{
			ID:         d.ID,
			Name:       d.Name,
			Default:    d.Default,
			Accent:     d.Accent,
			Background: d.Background,
			Density:    d.Density,
			Radius:     d.Radius,
			Widgets:    make([]widgetOut, 0, len(d.Widgets)),
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
	// Credentials are never editable through the structured UI write-path: the
	// GET side strips password hashes (json:"-"), so trusting the client here
	// would wipe them. Preserve whatever auth is on disk; auth is managed by
	// hand-editing config.yaml (or the raw YAML editor) + `axboard passwd`.
	if cur := s.getConfig(); cur != nil {
		next.Server.Auth = cur.Server.Auth
	}
	if err := config.Validate(&next); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := config.Save(s.configPath, &next); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Apply in-memory immediately so a GET right after this PUT is consistent.
	// Without this, GET serves the pre-PUT config until the fsnotify watcher
	// debounces + reloads (~250ms+), so the UI's post-write refetch reverts the
	// change and rapid add/remove operations clobber each other. The watcher
	// still fires shortly after and re-applies this (idempotent) plus reconciles
	// the health pool / alert channels.
	s.SetConfig(&next)
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

// handleContainers lists containers over the Docker/Podman socket for the
// container-status widget.
func (s *Server) handleContainers(w http.ResponseWriter, r *http.Request) {
	socket := "/var/run/docker.sock"
	if c := s.getConfig(); c != nil && c.Discovery.DockerSocket != "" {
		socket = c.Discovery.DockerSocket
	}
	list, err := discover.Containers(r.Context(), socket, r.URL.Query().Get("stats") == "1")
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"containers": []discover.Container{}, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"containers": list})
}

// handleContainerRestart restarts one container by name/id over the socket.
func (s *Server) handleContainerRestart(w http.ResponseWriter, r *http.Request) {
	socket := "/var/run/docker.sock"
	if c := s.getConfig(); c != nil && c.Discovery.DockerSocket != "" {
		socket = c.Discovery.DockerSocket
	}
	id := chi.URLParam(r, "id")
	if err := discover.RestartContainer(r.Context(), socket, id); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handlePush records a heartbeat for a push/heartbeat monitor. The monitored
// job pings /api/push/<its app id> on its schedule; a missed window flips it
// down. Auth-free by design (the id is the shared secret).
func (s *Server) handlePush(w http.ResponseWriter, r *http.Request) {
	s.Health.Push(chi.URLParam(r, "id"))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleHost returns a shallow host snapshot (load/memory/uptime).
func (s *Server) handleHost(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, host.Snapshot())
}

// handleHostProcs returns the top-N processes by CPU (default 8, max 30).
func (s *Server) handleHostProcs(w http.ResponseWriter, r *http.Request) {
	n := 8
	if v, err := strconv.Atoi(r.URL.Query().Get("n")); err == nil && v > 0 && v <= 30 {
		n = v
	}
	writeJSON(w, http.StatusOK, map[string]any{"procs": host.TopProcs(n)})
}

// handleWoL sends a Wake-on-LAN magic packet to the given MAC. Requires host
// networking to broadcast onto the LAN. Body/query: mac (aa:bb:cc:dd:ee:ff),
// optional broadcast (default 255.255.255.255).
func (s *Server) handleWoL(w http.ResponseWriter, r *http.Request) {
	mac := r.URL.Query().Get("mac")
	bcast := r.URL.Query().Get("broadcast")
	if bcast == "" {
		bcast = "255.255.255.255"
	}
	hw, err := net.ParseMAC(mac)
	if err != nil || len(hw) != 6 {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "invalid MAC"})
		return
	}
	packet := magicPacket(hw)
	conn, err := net.Dial("udp", net.JoinHostPort(bcast, "9"))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	defer conn.Close()
	if _, err := conn.Write(packet); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleAlertTest fires a sample notification through the currently-configured
// alert channels and reports which ones it triggered.
func (s *Server) handleAlertTest(w http.ResponseWriter, r *http.Request) {
	cfg := s.getConfig()
	if cfg == nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "no config loaded"})
		return
	}
	n := alert.New()
	n.SetConfig(cfg.Alerts)
	sent := n.SendTest(r.URL.Query().Get("channel"))
	writeJSON(w, http.StatusOK, map[string]any{"ok": len(sent) > 0, "channels": sent})
}

// magicPacket builds a Wake-on-LAN magic packet: 6×0xFF then the MAC repeated
// 16 times (102 bytes total).
func magicPacket(hw net.HardwareAddr) []byte {
	packet := make([]byte, 6, 102)
	for i := range packet {
		packet[i] = 0xFF
	}
	for i := 0; i < 16; i++ {
		packet = append(packet, hw...)
	}
	return packet
}

// handleUptimePing checks one URL for the uptime-monitor widget and returns
// {ok, status, ms}. Never errors the HTTP request — the failure is the payload.
func (s *Server) handleUptimePing(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("url")
	u, err := url.Parse(target)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "invalid url"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 9*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	req.Header.Set("User-Agent", "axboard")
	start := time.Now()
	resp, err := pingClient.Do(req)
	ms := time.Since(start).Milliseconds()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "ms": ms, "error": err.Error()})
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	resp.Body.Close()
	writeJSON(w, http.StatusOK, map[string]any{"ok": resp.StatusCode < 400, "status": resp.StatusCode, "ms": ms})
}

// handlePublicIP returns axboard's egress (WAN) IP + coarse geo/ISP via a free
// lookup, for the public-IP / VPN-status widget.
func (s *Server) handlePublicIP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		"http://ip-api.com/json/?fields=query,city,country,isp,org", nil)
	resp, err := proxyClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()
	var d map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&d)
	writeJSON(w, http.StatusOK, map[string]any{
		"ip": d["query"], "city": d["city"], "country": d["country"], "isp": d["isp"], "org": d["org"],
	})
}

// handleProxy fetches an http(s) URL server-side so browser widgets (RSS,
// calendar) can read cross-origin feeds that would otherwise be CORS-blocked.
// LAN-bound single-user posture; bounded by a timeout and a response cap.
func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("url")
	u, err := url.Parse(target)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		writeErr(w, http.StatusBadRequest, "url must be an http(s) URL")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Header.Set("User-Agent", "axboard")
	// Forward an optional auth header so widgets can raise API rate limits
	// (e.g. a GitHub/GitLab token lifts releases from 60/h to 5000/h).
	if a := r.Header.Get("Authorization"); a != "" {
		req.Header.Set("Authorization", a)
	}
	if pt := r.Header.Get("X-Proxy-Private-Token"); pt != "" {
		req.Header.Set("PRIVATE-TOKEN", pt)
	}
	resp, err := proxyClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(resp.Body, 4<<20)) // 4 MiB cap
}

// iconExts maps accepted upload content types to file extensions.
var iconExts = map[string]string{
	"image/png":     ".png",
	"image/jpeg":    ".jpg",
	"image/gif":     ".gif",
	"image/webp":    ".webp",
	"image/svg+xml": ".svg",
	"image/x-icon":  ".ico",
}

// handleUploadIcon stores an uploaded image under iconsDir (named by content
// hash for dedup) and returns {"icon": "/api/icons/<name>"} for use as an app
// icon. LAN-bound single-user posture; capped at 2 MiB.
func (s *Server) handleUploadIcon(w http.ResponseWriter, r *http.Request) {
	if s.iconsDir == "" {
		writeErr(w, http.StatusInternalServerError, "icon storage not configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10 MiB — also used for background images
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "missing file field: "+err.Error())
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ct := hdr.Header.Get("Content-Type")
	if ct == "" {
		ct = http.DetectContentType(data)
	}
	ext, ok := iconExts[ct]
	if !ok {
		// http.DetectContentType returns text/plain for svg; sniff by extension.
		if strings.HasSuffix(strings.ToLower(hdr.Filename), ".svg") {
			ext, ok = ".svg", true
		}
	}
	if !ok {
		writeErr(w, http.StatusBadRequest, "unsupported image type (png/jpg/gif/webp/svg/ico)")
		return
	}
	sum := sha256.Sum256(data)
	name := hex.EncodeToString(sum[:8]) + ext
	if err := os.WriteFile(filepath.Join(s.iconsDir, name), data, 0o644); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"icon": "/api/icons/" + name})
}

// handleGetIcon serves a previously uploaded icon (path-traversal safe).
func (s *Server) handleGetIcon(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" || strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		http.NotFound(w, r)
		return
	}
	p := filepath.Join(s.iconsDir, filepath.Base(name))
	w.Header().Set("Cache-Control", "public, max-age=604800")
	http.ServeFile(w, r, p)
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.Health.Snapshot())
}

func (s *Server) handleHistory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.Health.HistorySnapshot())
}

// handleUptime returns per-app 24h/7d/30d uptime percentages (-1 = no data).
func (s *Server) handleUptime(w http.ResponseWriter, _ *http.Request) {
	u := s.Health.Uptime()
	if u == nil {
		writeJSON(w, http.StatusOK, map[string]map[string]int{})
		return
	}
	writeJSON(w, http.StatusOK, u.Snapshot(time.Now()))
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
