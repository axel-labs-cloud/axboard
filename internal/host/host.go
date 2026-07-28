// Package host exposes a shallow snapshot of the machine axboard runs on —
// load average, memory, uptime — for the host-stats widget. Deliberately not a
// metrics collector: point at Grafana for real observability.
package host

import (
	"os"
	"runtime"
	"strconv"
	"strings"
)

type Stats struct {
	CPUs      int     `json:"cpus"`
	Load1     float64 `json:"load1"`
	Load5     float64 `json:"load5"`
	Load15    float64 `json:"load15"`
	MemTotal  uint64  `json:"mem_total"` // bytes
	MemUsed   uint64  `json:"mem_used"`  // bytes
	UptimeSec float64 `json:"uptime_sec"`
}

// Snapshot reads /proc for a point-in-time host view. Missing files are
// tolerated (fields stay zero) so it works on non-Linux dev machines.
func Snapshot() Stats {
	s := Stats{CPUs: runtime.NumCPU()}

	if b, err := os.ReadFile("/proc/loadavg"); err == nil {
		f := strings.Fields(string(b))
		if len(f) >= 3 {
			s.Load1, _ = strconv.ParseFloat(f[0], 64)
			s.Load5, _ = strconv.ParseFloat(f[1], 64)
			s.Load15, _ = strconv.ParseFloat(f[2], 64)
		}
	}

	if b, err := os.ReadFile("/proc/meminfo"); err == nil {
		var total, avail uint64
		for _, line := range strings.Split(string(b), "\n") {
			f := strings.Fields(line)
			if len(f) < 2 {
				continue
			}
			kb, _ := strconv.ParseUint(f[1], 10, 64)
			switch f[0] {
			case "MemTotal:":
				total = kb * 1024
			case "MemAvailable:":
				avail = kb * 1024
			}
		}
		s.MemTotal = total
		if total > avail {
			s.MemUsed = total - avail
		}
	}

	if b, err := os.ReadFile("/proc/uptime"); err == nil {
		f := strings.Fields(string(b))
		if len(f) >= 1 {
			s.UptimeSec, _ = strconv.ParseFloat(f[0], 64)
		}
	}

	return s
}
