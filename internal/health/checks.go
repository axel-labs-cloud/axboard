package health

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

// newHealthClient builds the single shared client the pool reuses for every
// HTTP check. One client (not one per check) so idle keep-alive connections
// are pooled and reused instead of leaking until GC. Redirects are NOT
// followed: a service that 302s to a 200 login page must not read as healthy —
// expect_status is compared against the FIRST response. Self-signed certs are
// tolerated (health is liveness, not auth). Per-check timeouts come from the
// request context, so the client itself has no global Timeout.
func newHealthClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// CheckHTTP issues a GET with the shared client and compares the status code
// against expect_status.
func CheckHTTP(ctx context.Context, client *http.Client, h *config.Health) Result {
	timeout := h.Timeout.Duration()
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	expect := h.ExpectStatus
	if expect == 0 {
		expect = 200
	}

	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, h.URL, nil)
	if err != nil {
		return Result{Status: StatusDown, LastChecked: time.Now(), Error: err.Error()}
	}

	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Status: StatusDown, LastChecked: time.Now(), ResponseMS: elapsed, Error: err.Error()}
	}
	// Drain (bounded) then close so the connection can be reused by keep-alive.
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
		_ = resp.Body.Close()
	}()

	if resp.StatusCode == expect {
		return Result{Status: StatusHealthy, LastChecked: time.Now(), ResponseMS: elapsed}
	}
	return Result{
		Status:      StatusDegraded,
		LastChecked: time.Now(),
		ResponseMS:  elapsed,
		Error:       fmt.Sprintf("status %d (expected %d)", resp.StatusCode, expect),
	}
}

// CheckTCP dials host:port. A successful dial = healthy.
func CheckTCP(ctx context.Context, h *config.Health) Result {
	timeout := h.Timeout.Duration()
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	addr := net.JoinHostPort(h.Host, fmt.Sprintf("%d", h.Port))

	dialer := &net.Dialer{Timeout: timeout}
	start := time.Now()
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Status: StatusDown, LastChecked: time.Now(), ResponseMS: elapsed, Error: err.Error()}
	}
	_ = conn.Close()
	return Result{Status: StatusHealthy, LastChecked: time.Now(), ResponseMS: elapsed}
}
