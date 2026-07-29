package health

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

// newHealthClient builds a shared client the pool reuses for every HTTP check.
// One client (not one per check) so idle keep-alive connections are pooled and
// reused instead of leaking until GC. Redirects are NOT followed: a service
// that 302s to a 200 login page must not read as healthy — expect_status is
// compared against the FIRST response. `insecure` skips TLS verification
// (the homelab default); a per-check health.insecure=false opts back into
// enforcement, which is why the pool keeps one client of each kind. Per-check
// timeouts come from the request context, so the client has no global Timeout.
func newHealthClient(insecure bool) *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: insecure},
		},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// CheckHTTP issues a GET with the given client, compares the status code
// against expect_status, and (optionally) requires the body to contain a
// substring. Custom headers from the config are attached to the request.
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
	for k, v := range h.Headers {
		req.Header.Set(k, v)
	}

	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Status: StatusDown, LastChecked: time.Now(), ResponseMS: elapsed, Error: err.Error()}
	}
	defer resp.Body.Close()

	// Capture the leaf certificate's expiry for HTTPS endpoints (free, like
	// Uptime Kuma) so the UI can show cert age and we can alert before expiry.
	var certExpiry, certNotBefore time.Time
	var certIssuer string
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		leaf := resp.TLS.PeerCertificates[0]
		certExpiry = leaf.NotAfter
		certNotBefore = leaf.NotBefore
		certIssuer = leaf.Issuer.CommonName
		if certIssuer == "" && len(leaf.Issuer.Organization) > 0 {
			certIssuer = leaf.Issuer.Organization[0]
		}
	}

	// Read a bounded prefix if we need to match the body; otherwise just drain
	// a little so the connection can be reused by keep-alive.
	var bodyMatched = true
	if h.BodyContains != "" {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
		bodyMatched = strings.Contains(string(b), h.BodyContains)
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))

	if resp.StatusCode != expect {
		return Result{
			Status:        StatusDegraded,
			LastChecked:   time.Now(),
			ResponseMS:    elapsed,
			Error:         fmt.Sprintf("status %d (expected %d)", resp.StatusCode, expect),
			CertExpiry:    certExpiry,
			CertIssuer:    certIssuer,
			CertNotBefore: certNotBefore,
		}
	}
	if !bodyMatched {
		return Result{
			Status:        StatusDegraded,
			LastChecked:   time.Now(),
			ResponseMS:    elapsed,
			Error:         fmt.Sprintf("body did not contain %q", h.BodyContains),
			CertExpiry:    certExpiry,
			CertIssuer:    certIssuer,
			CertNotBefore: certNotBefore,
		}
	}
	return Result{Status: StatusHealthy, LastChecked: time.Now(), ResponseMS: elapsed, CertExpiry: certExpiry, CertIssuer: certIssuer, CertNotBefore: certNotBefore}
}

// CheckDNS resolves the health host and reports healthy when it resolves. When
// body_contains is set, the resolved addresses must include that substring.
func CheckDNS(ctx context.Context, h *config.Health) Result {
	timeout := h.Timeout.Duration()
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	host := h.Host
	if host == "" {
		host = h.URL
	}
	start := time.Now()
	addrs, err := net.DefaultResolver.LookupHost(reqCtx, host)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Status: StatusDown, LastChecked: time.Now(), ResponseMS: elapsed, Error: err.Error()}
	}
	if len(addrs) == 0 {
		return Result{Status: StatusDown, LastChecked: time.Now(), ResponseMS: elapsed, Error: "no records"}
	}
	if h.BodyContains != "" && !strings.Contains(strings.Join(addrs, ","), h.BodyContains) {
		return Result{Status: StatusDegraded, LastChecked: time.Now(), ResponseMS: elapsed, Error: fmt.Sprintf("resolved %v, missing %q", addrs, h.BodyContains)}
	}
	return Result{Status: StatusHealthy, LastChecked: time.Now(), ResponseMS: elapsed}
}

// CheckICMP sends a single ICMP echo to h.Host by shelling out to `ping`
// (busybox in the container image). Requires the NET_RAW capability. A reply =
// healthy; timeout/unreachable = down.
func CheckICMP(ctx context.Context, h *config.Health) Result {
	timeout := h.Timeout.Duration()
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	secs := int(timeout.Seconds())
	if secs < 1 {
		secs = 1
	}
	// -c 1 = one echo, -W secs = wait-for-reply timeout. Give the process a
	// little slack beyond the ping timeout before we hard-cancel it.
	runCtx, cancel := context.WithTimeout(ctx, timeout+2*time.Second)
	defer cancel()
	start := time.Now()
	cmd := exec.CommandContext(runCtx, "ping", "-c", "1", "-W", strconv.Itoa(secs), h.Host)
	out, err := cmd.CombinedOutput()
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return Result{Status: StatusDown, LastChecked: time.Now(), ResponseMS: elapsed, Error: msg}
	}
	return Result{Status: StatusHealthy, LastChecked: time.Now(), ResponseMS: elapsed}
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
