package health

import "time"

type Status string

const (
	StatusUnknown  Status = "unknown"
	StatusHealthy  Status = "healthy"
	StatusDegraded Status = "degraded"
	StatusDown     Status = "down"
)

type Result struct {
	Status      Status    `json:"status"`
	LastChecked time.Time `json:"last_checked,omitzero"`
	ResponseMS  int64     `json:"response_ms,omitempty"`
	Error       string    `json:"error,omitempty"`
	// CertExpiry is the leaf TLS certificate's NotAfter for an HTTPS check
	// (zero when not HTTPS or unavailable). Powers cert-expiry display + alerts.
	CertExpiry    time.Time `json:"cert_expiry,omitzero"`
	CertIssuer    string    `json:"cert_issuer,omitempty"`
	CertNotBefore time.Time `json:"cert_not_before,omitzero"`
}

// HistPoint is one entry in an app's rolling health history — enough to draw a
// sparkline and compute a recent uptime percentage.
type HistPoint struct {
	Status     Status    `json:"status"`
	ResponseMS int64     `json:"response_ms"`
	At         time.Time `json:"at"`
}
