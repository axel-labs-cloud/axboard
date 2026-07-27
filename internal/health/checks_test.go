package health

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

func TestCheckHTTPStatusAndBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Token") != "secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer srv.Close()
	client := newHealthClient(true)

	// Missing header → 401 → degraded (status mismatch).
	if got := CheckHTTP(context.Background(), client, &config.Health{URL: srv.URL, ExpectStatus: 200}); got.Status != StatusDegraded {
		t.Errorf("missing header: got %s want degraded", got.Status)
	}

	// Header present + body matches → healthy.
	h := &config.Health{
		URL:          srv.URL,
		ExpectStatus: 200,
		Headers:      map[string]string{"X-Token": "secret"},
		BodyContains: `"status":"ok"`,
	}
	if got := CheckHTTP(context.Background(), client, h); got.Status != StatusHealthy {
		t.Errorf("header+body: got %s (%s) want healthy", got.Status, got.Error)
	}

	// Body substring absent → degraded even though status is 200.
	h.BodyContains = "not-in-body"
	if got := CheckHTTP(context.Background(), client, h); got.Status != StatusDegraded {
		t.Errorf("body mismatch: got %s want degraded", got.Status)
	}
}

func TestPoolRecordsHistory(t *testing.T) {
	p := NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		return Result{Status: StatusHealthy}
	})
	defer p.Stop()
	p.Reconcile([]config.App{httpApp("a", "http://a/ping")})
	eventually(t, func() bool { return len(p.HistorySnapshot()["a"]) >= 1 }, "history recorded")

	p.Force("a")
	eventually(t, func() bool { return len(p.HistorySnapshot()["a"]) >= 2 }, "forced check appended")

	// Removing the app purges its history.
	p.Reconcile(nil)
	eventually(t, func() bool { _, ok := p.HistorySnapshot()["a"]; return !ok }, "history purged on removal")
}
