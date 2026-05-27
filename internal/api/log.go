package api

import (
	"log/slog"
	"time"
)

func httpLog(method, path string, status int, dur time.Duration) {
	slog.Info("http", "method", method, "path", path, "status", status, "dur_ms", dur.Milliseconds())
}
