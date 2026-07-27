package health

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

// Pool runs one goroutine per app whose health.type != "none".
//
// On Reconcile:
//   - new app IDs spawn a worker
//   - removed app IDs cancel their worker and purge the cached result
//   - existing app IDs whose health-config hash changed are restarted
//   - existing app IDs whose hash is unchanged are left alone (this is the
//     whole point — we don't reset every status to unknown on every YAML save)
// CheckFunc runs a single health check and returns its result. The pool's
// default routes by h.Type to CheckHTTP/CheckTCP over a shared client; tests
// inject their own so the pool can be exercised without real network.
type CheckFunc func(ctx context.Context, h *config.Health) Result

type Pool struct {
	mu       sync.Mutex
	workers  map[string]*worker
	results  sync.Map // map[string]Result
	onChange func(id string)
	check    CheckFunc
}

type worker struct {
	cancel context.CancelFunc
	hash   string
	check  chan struct{} // signal a forced re-check
}

// NewPool builds a pool that runs real HTTP/TCP checks over one shared client.
func NewPool() *Pool {
	client := newHealthClient()
	return NewPoolWithChecker(func(ctx context.Context, h *config.Health) Result {
		switch h.Type {
		case config.HealthHTTP:
			return CheckHTTP(ctx, client, h)
		case config.HealthTCP:
			return CheckTCP(ctx, h)
		default:
			return Result{Status: StatusUnknown, LastChecked: time.Now()}
		}
	})
}

// NewPoolWithChecker builds a pool with an injectable check function. Used by
// tests to avoid real network I/O.
func NewPoolWithChecker(check CheckFunc) *Pool {
	return &Pool{
		workers: make(map[string]*worker),
		check:   check,
	}
}

// OnChange registers a callback fired when any app's status flips. Used to
// broadcast SSE events. Set once at startup.
func (p *Pool) OnChange(cb func(id string)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.onChange = cb
}

// Reconcile aligns the worker pool to apps.
func (p *Pool) Reconcile(apps []config.App) {
	p.mu.Lock()
	defer p.mu.Unlock()

	seen := make(map[string]bool, len(apps))
	for _, app := range apps {
		seen[app.ID] = true

		needsWorker := app.Health != nil && app.Health.Type != config.HealthNone && app.Health.Type != ""
		newHash := hashHealth(app)

		existing, ok := p.workers[app.ID]
		if ok && existing.hash == newHash {
			continue
		}
		if ok {
			existing.cancel()
			delete(p.workers, app.ID)
			// If the app is still configured but no longer has a health
			// check, the cached result becomes meaningless — purge it.
			// (When the hash changed but a worker IS still needed, the
			// first run of the new worker will overwrite this anyway.)
			p.results.Delete(app.ID)
		}
		if !needsWorker {
			continue
		}

		ctx, cancel := context.WithCancel(context.Background())
		w := &worker{cancel: cancel, hash: newHash, check: make(chan struct{}, 1)}
		p.workers[app.ID] = w
		// Capture by value — apps slice may be reused by caller.
		go p.run(ctx, app, w)
	}

	for id, w := range p.workers {
		if !seen[id] {
			w.cancel()
			delete(p.workers, id)
			p.results.Delete(id)
		}
	}
}

// Stop tears down all workers. Safe to call multiple times.
func (p *Pool) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for id, w := range p.workers {
		w.cancel()
		delete(p.workers, id)
	}
}

// Get returns the most recent result for an app, or StatusUnknown if no check
// has run yet (or the app has no health config).
func (p *Pool) Get(id string) Result {
	v, ok := p.results.Load(id)
	if !ok {
		return Result{Status: StatusUnknown}
	}
	return v.(Result)
}

// Snapshot returns the full status map.
func (p *Pool) Snapshot() map[string]Result {
	out := map[string]Result{}
	p.results.Range(func(k, v any) bool {
		out[k.(string)] = v.(Result)
		return true
	})
	return out
}

// Force triggers an immediate re-check of one app. No-op if the app has no
// worker (i.e. no health config).
func (p *Pool) Force(id string) {
	p.mu.Lock()
	w, ok := p.workers[id]
	p.mu.Unlock()
	if !ok {
		return
	}
	select {
	case w.check <- struct{}{}:
	default:
	}
}

func (p *Pool) run(ctx context.Context, app config.App, w *worker) {
	interval := app.Health.Interval.Duration()
	if interval <= 0 {
		interval = 60 * time.Second
	}

	check := func() {
		res := p.check(ctx, app.Health)
		prev, _ := p.results.Load(app.ID)
		p.results.Store(app.ID, res)
		if prev == nil || prev.(Result).Status != res.Status {
			p.mu.Lock()
			cb := p.onChange
			p.mu.Unlock()
			if cb != nil {
				cb(app.ID)
			}
		}
	}

	// Initial check immediately so the UI doesn't sit at "unknown" for a full
	// interval after boot.
	check()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			check()
		case <-w.check:
			check()
		}
	}
}

func hashHealth(app config.App) string {
	if app.Health == nil {
		return ""
	}
	b, _ := json.Marshal(app.Health)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:8])
}
