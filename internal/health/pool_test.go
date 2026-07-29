package health

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

// httpApp builds an app with an HTTP health check and a very long interval, so
// the only check a worker runs during a test is its immediate initial one —
// the ticker never fires. That makes the invocation counter a reliable proxy
// for "how many times was a worker (re)spawned".
func httpApp(id, url string) config.App {
	return config.App{
		ID: id, Name: id, URL: "http://" + id,
		Health: &config.Health{
			Type:     config.HealthHTTP,
			URL:      url,
			Interval: config.Duration(time.Hour),
		},
	}
}

func eventually(t *testing.T, cond func() bool, msg string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("condition not met within timeout: %s", msg)
}

func TestReconcileSpawnAndResult(t *testing.T) {
	var calls int64
	p := NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		atomic.AddInt64(&calls, 1)
		return Result{Status: StatusHealthy, LastChecked: time.Now()}
	})
	defer p.Stop()

	p.Reconcile([]config.App{httpApp("a", "http://a/ping")})
	eventually(t, func() bool { return p.Get("a").Status == StatusHealthy },
		"app a should become healthy after initial check")
	if got := atomic.LoadInt64(&calls); got != 1 {
		t.Fatalf("expected exactly 1 check after spawn, got %d", got)
	}
}

func TestRetriesGateDown(t *testing.T) {
	p := NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		return Result{Status: StatusDown, LastChecked: time.Now()}
	})
	defer p.Stop()

	app := httpApp("a", "http://a/ping")
	app.Health.Retries = 2
	p.Reconcile([]config.App{app})

	// Initial check: fails=1 <= 2 → degraded, not down.
	eventually(t, func() bool { return p.Get("a").Status == StatusDegraded }, "first failure should be degraded (retrying)")
	if p.Get("a").Status == StatusDown {
		t.Fatal("should not be down on first failure with retries=2")
	}
	// Two more forced checks push fails to 3 > 2 → down.
	p.Force("a")
	p.Force("a")
	eventually(t, func() bool { return p.Get("a").Status == StatusDown }, "should be down after retries exhausted")
}

func TestReconcileUnchangedDoesNotRestart(t *testing.T) {
	var calls int64
	p := NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		atomic.AddInt64(&calls, 1)
		return Result{Status: StatusHealthy, LastChecked: time.Now()}
	})
	defer p.Stop()

	app := httpApp("a", "http://a/ping")
	p.Reconcile([]config.App{app})
	eventually(t, func() bool { return atomic.LoadInt64(&calls) == 1 }, "first check")

	// Same health config → hash unchanged → worker must be left alone.
	p.Reconcile([]config.App{app})
	time.Sleep(80 * time.Millisecond)
	if got := atomic.LoadInt64(&calls); got != 1 {
		t.Fatalf("unchanged app should not re-check; got %d checks", got)
	}
}

func TestReconcileChangedRestarts(t *testing.T) {
	var calls int64
	p := NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		atomic.AddInt64(&calls, 1)
		return Result{Status: StatusHealthy, LastChecked: time.Now()}
	})
	defer p.Stop()

	p.Reconcile([]config.App{httpApp("a", "http://a/ping")})
	eventually(t, func() bool { return atomic.LoadInt64(&calls) == 1 }, "first check")

	// Changed health URL → hash changes → worker restarts → new initial check.
	p.Reconcile([]config.App{httpApp("a", "http://a/healthz")})
	eventually(t, func() bool { return atomic.LoadInt64(&calls) == 2 },
		"changed app should restart and re-check")
}

func TestReconcileRemovePurgesResult(t *testing.T) {
	p := NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		return Result{Status: StatusHealthy, LastChecked: time.Now()}
	})
	defer p.Stop()

	p.Reconcile([]config.App{httpApp("a", "http://a/ping")})
	eventually(t, func() bool { return p.Get("a").Status == StatusHealthy }, "healthy")

	// Removing the app must cancel its worker and purge the cached result.
	p.Reconcile(nil)
	eventually(t, func() bool { return p.Get("a").Status == StatusUnknown },
		"removed app result should be purged to unknown")
	if _, ok := p.Snapshot()["a"]; ok {
		t.Errorf("snapshot should not contain purged app a")
	}
}

func TestReconcileNoneTypeSkipsWorker(t *testing.T) {
	var calls int64
	p := NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		atomic.AddInt64(&calls, 1)
		return Result{Status: StatusHealthy}
	})
	defer p.Stop()

	// type=none and nil health must not spawn a worker.
	p.Reconcile([]config.App{
		{ID: "n", Name: "n", URL: "u", Health: &config.Health{Type: config.HealthNone}},
		{ID: "m", Name: "m", URL: "u"},
	})
	time.Sleep(50 * time.Millisecond)
	if got := atomic.LoadInt64(&calls); got != 0 {
		t.Errorf("no worker should run for none/nil health; got %d checks", got)
	}
	if p.Get("n").Status != StatusUnknown {
		t.Errorf("none-type app should stay unknown")
	}
}
