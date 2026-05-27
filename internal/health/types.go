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
}
