package api

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// fetchReq is an authenticated outbound request proxied on the widget's behalf.
// Unlike handleProxy (GET, no headers), this forwards a method, a small set of
// headers (e.g. X-Api-Key / Authorization) and an optional body — what the
// self-hosted service widgets (Sonarr, Proxmox, Transmission, …) need. It is
// gated by the same auth as the rest of /api; creds live in config.yaml per the
// homelab trust model. Not an open proxy: link-local / cloud-metadata targets
// are refused (see safeTarget).
type fetchReq struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
	Body    string            `json:"body"`
}

// fetchClient follows redirects and tolerates self-signed certs (homelab
// services are commonly behind their own CA / plain IPs).
var fetchClient = pingClient // reuse: 10s timeout + InsecureSkipVerify

// handleFetch proxies one authenticated request and streams the upstream
// response (status + content-type + capped body) back to the widget.
func (s *Server) handleFetch(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	var fr fetchReq
	if err := json.NewDecoder(r.Body).Decode(&fr); err != nil {
		writeErr(w, http.StatusBadRequest, "decode: "+err.Error())
		return
	}
	u, err := url.Parse(strings.TrimSpace(fr.URL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		writeErr(w, http.StatusBadRequest, "url must be an http(s) URL")
		return
	}
	if !safeTarget(u.Hostname()) {
		writeErr(w, http.StatusForbidden, "target host not allowed")
		return
	}
	method := strings.ToUpper(strings.TrimSpace(fr.Method))
	if method == "" {
		method = http.MethodGet
	}
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch:
	default:
		writeErr(w, http.StatusBadRequest, "method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	var body io.Reader
	if fr.Body != "" {
		body = strings.NewReader(fr.Body)
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Header.Set("User-Agent", "axboard")
	req.Header.Set("Accept", "application/json")
	for k, v := range fr.Headers {
		if k == "" {
			continue
		}
		req.Header.Set(k, v)
	}
	resp, err := fetchClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	// Surface the session-id header Transmission's CSRF handshake returns so the
	// client can retry with it.
	if sid := resp.Header.Get("X-Transmission-Session-Id"); sid != "" {
		w.Header().Set("X-Transmission-Session-Id", sid)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, io.LimitReader(resp.Body, 4<<20)) // 4 MiB cap
}

// safeTarget refuses cloud-metadata and link-local hosts. Private LAN ranges
// (10/8, 172.16/12, 192.168/16) are intentionally allowed — that's where
// homelab services live — and access is already gated by auth.
func safeTarget(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return false
		}
		// 169.254.169.254 (cloud metadata) is link-local, already blocked above.
	}
	return true
}
