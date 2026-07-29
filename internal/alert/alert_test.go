package alert

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

func TestClassifyOnlyFiresOnDownOrRecovered(t *testing.T) {
	cases := []struct {
		prev, cur string
		want      bool
		down      bool
	}{
		{"healthy", "down", true, true},
		{"unknown", "down", true, true},
		{"down", "healthy", true, false},
		{"healthy", "degraded", false, false},
		{"degraded", "healthy", false, false},
		{"down", "degraded", false, false}, // recovered only from down→healthy
		{"healthy", "healthy", false, false},
	}
	for _, c := range cases {
		e, ok := classify("svc", c.prev, c.cur)
		if ok != c.want {
			t.Errorf("classify(%s→%s) ok=%v want %v", c.prev, c.cur, ok, c.want)
		}
		if ok && e.down != c.down {
			t.Errorf("classify(%s→%s) down=%v want %v", c.prev, c.cur, e.down, c.down)
		}
	}
}

func TestNtfyRequestDown(t *testing.T) {
	e, _ := classify("gitlab", "healthy", "down")
	req, err := NtfyRequest(context.Background(), config.NtfyConfig{Topic: "homelab", Token: "tk_secret"}, e)
	if err != nil {
		t.Fatal(err)
	}
	if req.URL.String() != "https://ntfy.sh/homelab" {
		t.Errorf("url = %s", req.URL.String())
	}
	if got := req.Header.Get("Title"); !strings.Contains(got, "gitlab") {
		t.Errorf("title = %q", got)
	}
	if req.Header.Get("Priority") != "high" {
		t.Errorf("down alert should be high priority, got %q", req.Header.Get("Priority"))
	}
	if req.Header.Get("Authorization") != "Bearer tk_secret" {
		t.Errorf("auth = %q", req.Header.Get("Authorization"))
	}
	body, _ := readAll(req)
	if !strings.Contains(body, "went down") {
		t.Errorf("body = %q", body)
	}
}

func TestNtfyRequestRecoveredUsesCustomServer(t *testing.T) {
	e, _ := classify("gitlab", "down", "healthy")
	req, err := NtfyRequest(context.Background(), config.NtfyConfig{Server: "https://ntfy.lan/", Topic: "ops"}, e)
	if err != nil {
		t.Fatal(err)
	}
	if req.URL.String() != "https://ntfy.lan/ops" {
		t.Errorf("url = %s (trailing slash should be trimmed)", req.URL.String())
	}
	if req.Header.Get("Priority") != "default" {
		t.Errorf("recovery priority = %q", req.Header.Get("Priority"))
	}
}

func TestEmailMessageHasHeaders(t *testing.T) {
	e, _ := classify("nas", "healthy", "down")
	msg := string(EmailMessage(config.EmailConfig{From: "bot@lan", To: "me@lan"}, e))
	for _, want := range []string{"From: bot@lan", "To: me@lan", "Subject: [axboard]", "went down"} {
		if !strings.Contains(msg, want) {
			t.Errorf("email missing %q in:\n%s", want, msg)
		}
	}
}

// Notify should actually POST to a configured ntfy server on a down event.
func TestNotifyDispatchesNtfy(t *testing.T) {
	var mu sync.Mutex
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		w.WriteHeader(200)
	}))
	defer srv.Close()

	n := New()
	n.SetConfig(config.AlertsConfig{Ntfy: &config.NtfyConfig{Server: srv.URL, Topic: "t"}})
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	n.Notify("svc", "healthy", "down", now)

	// The send is in a goroutine; wait briefly.
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return hits == 1 })

	// A non-alert transition should NOT fire.
	n.Notify("svc", "healthy", "degraded", now)
	if hits != 1 {
		t.Errorf("degraded transition should not alert, hits=%d", hits)
	}
}

func TestMuteSuppressesAlerts(t *testing.T) {
	var mu sync.Mutex
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		w.WriteHeader(200)
	}))
	defer srv.Close()
	n := New()
	n.SetConfig(config.AlertsConfig{Ntfy: &config.NtfyConfig{Server: srv.URL, Topic: "t"}, Muted: []string{"svc"}})
	n.Notify("svc", "healthy", "down", time.Now())
	n.NotifyCert("svc", 1, "2026-01-01")
	time.Sleep(30 * time.Millisecond)
	if hits != 0 {
		t.Errorf("muted app should not alert, hits=%d", hits)
	}
}

func TestResendWhileDown(t *testing.T) {
	var mu sync.Mutex
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		w.WriteHeader(200)
	}))
	defer srv.Close()
	n := New()
	n.SetConfig(config.AlertsConfig{Ntfy: &config.NtfyConfig{Server: srv.URL, Topic: "t"}, ResendMinutes: 5})
	t0 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	n.Notify("svc", "healthy", "down", t0)
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return hits == 1 })
	// Too soon → no resend.
	n.MaybeResend("svc", "down", t0.Add(3*time.Minute))
	time.Sleep(20 * time.Millisecond)
	if hits != 1 {
		t.Errorf("resend before interval, hits=%d", hits)
	}
	// After the interval → resend.
	n.MaybeResend("svc", "down", t0.Add(6*time.Minute))
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return hits == 2 })
	// Recovered → clears; no more resends.
	n.Notify("svc", "down", "healthy", t0.Add(7*time.Minute))
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return hits == 3 })
	n.MaybeResend("svc", "down", t0.Add(20*time.Minute)) // not tracked anymore
	time.Sleep(20 * time.Millisecond)
	if hits != 3 {
		t.Errorf("resend after recovery should not fire, hits=%d", hits)
	}
}

func TestNotifyCertThresholdAndDedup(t *testing.T) {
	var mu sync.Mutex
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		w.WriteHeader(200)
	}))
	defer srv.Close()

	n := New()
	n.SetConfig(config.AlertsConfig{Ntfy: &config.NtfyConfig{Server: srv.URL, Topic: "t"}, CertExpiryDays: 14})

	// 30 days left → above threshold → no alert.
	n.NotifyCert("svc", 30, "2026-01-01")
	if hits != 0 {
		t.Fatalf("30 days should not alert, hits=%d", hits)
	}
	// 10 days left → alert once.
	n.NotifyCert("svc", 10, "2026-01-01")
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return hits == 1 })
	// Same day again → deduped.
	n.NotifyCert("svc", 9, "2026-01-01")
	if hits != 1 {
		t.Errorf("same-day cert alert should dedup, hits=%d", hits)
	}
	// Next day → alerts again.
	n.NotifyCert("svc", 9, "2026-01-02")
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return hits == 2 })
}

func readAll(req *http.Request) (string, error) {
	b := make([]byte, req.ContentLength)
	body, err := req.GetBody()
	if err != nil {
		return "", err
	}
	n, _ := body.Read(b)
	return string(b[:n]), nil
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	for i := 0; i < 200; i++ {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition not met in time")
}
