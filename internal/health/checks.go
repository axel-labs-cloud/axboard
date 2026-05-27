package health

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/ianua/internal/config"
)

// CheckHTTP issues a GET and compares the status code against expect_status.
func CheckHTTP(ctx context.Context, h *config.Health) Result {
	timeout := h.Timeout.Duration()
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	expect := h.ExpectStatus
	if expect == 0 {
		expect = 200
	}

	tr := &http.Transport{
		// Homelab services often have self-signed certs. Health checks are
		// not auth — we just need a TCP+TLS handshake and a status code.
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	client := &http.Client{Transport: tr, Timeout: timeout}

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
	defer resp.Body.Close()

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
