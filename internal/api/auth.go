package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/auth"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

const sessionCookieName = "axboard_session"

// currentAuth returns the live auth config only when it is actually usable
// (manager wired AND ≥1 user configured), else nil.
func (s *Server) currentAuth() *config.AuthConfig {
	if s.authMgr == nil {
		return nil
	}
	c := s.getConfig()
	if c == nil || c.Server.Auth == nil || len(c.Server.Auth.Users) == 0 {
		return nil
	}
	return c.Server.Auth
}

// authActive reports whether requests should be gated right now.
func (s *Server) authActive() bool { return s.currentAuth() != nil }

// sessionUser returns the authenticated username from the request's session
// cookie, verifying the signature/expiry AND that the user still exists.
func (s *Server) sessionUser(r *http.Request) (string, bool) {
	ac := s.currentAuth()
	if ac == nil {
		return "", false
	}
	ck, err := r.Cookie(sessionCookieName)
	if err != nil {
		return "", false
	}
	name, ok := s.authMgr.Verify(ck.Value, time.Now())
	if !ok {
		return "", false
	}
	for _, u := range ac.Users {
		if u.Username == name {
			return name, true
		}
	}
	return "", false // user was removed from config → session invalid
}

// apiAuthMW gates the /api subtree when auth is active. A small set of
// endpoints stay public so external tooling and the login flow keep working:
// version, the auth endpoints themselves, and heartbeat ingest (/api/push).
func (s *Server) apiAuthMW(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.authActive() {
			next.ServeHTTP(w, r)
			return
		}
		p := r.URL.Path
		if p == "/api/version" || p == "/api/auth" ||
			strings.HasPrefix(p, "/api/auth/") || strings.HasPrefix(p, "/api/push/") {
			next.ServeHTTP(w, r)
			return
		}
		if _, ok := s.sessionUser(r); ok {
			next.ServeHTTP(w, r)
			return
		}
		writeErr(w, http.StatusUnauthorized, "authentication required")
	})
}

// handleAuthStatus tells the SPA whether login is required and who (if anyone)
// is currently signed in.
func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	if !s.authActive() {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false})
		return
	}
	name, ok := s.sessionUser(r)
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "authenticated": ok, "user": name})
}

// handleLogin verifies credentials and sets a signed session cookie.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	ac := s.currentAuth()
	if ac == nil {
		writeErr(w, http.StatusNotFound, "auth not enabled")
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "decode: "+err.Error())
		return
	}
	hash := s.dummyHash
	found := false
	for _, u := range ac.Users {
		if u.Username == body.Username {
			hash, found = u.PasswordHash, true
			break
		}
	}
	// Verify unconditionally (even for unknown users, against the dummy hash) so
	// timing doesn't reveal which usernames exist.
	if !auth.VerifyPassword(body.Password, hash) || !found {
		writeErr(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	ttl := ac.SessionTTL.Duration()
	tok := s.authMgr.Issue(body.Username, ttl, time.Now())
	http.SetCookie(w, sessionCookie(tok, ttl, r))
	writeJSON(w, http.StatusOK, map[string]any{"user": body.Username})
}

// handleLogout clears the session cookie.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	c := sessionCookie("", 0, r)
	c.Expires = time.Unix(0, 0)
	c.MaxAge = -1
	http.SetCookie(w, c)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// sessionCookie builds the session cookie. Secure is set when the request
// arrived over TLS (directly or via a terminating proxy) so plain-HTTP LAN use
// still works.
func sessionCookie(val string, ttl time.Duration, r *http.Request) *http.Cookie {
	if ttl <= 0 {
		ttl = 7 * 24 * time.Hour
	}
	c := &http.Cookie{
		Name:     sessionCookieName,
		Value:    val,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(ttl),
		MaxAge:   int(ttl.Seconds()),
	}
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		c.Secure = true
	}
	return c
}
