package health

import (
	"encoding/json"
	"os"
	"sort"
	"sync"
	"time"
)

// UptimeStore keeps long-window uptime as hourly buckets per app, persisted to
// disk so 24h/7d/30d figures survive restarts without storing every raw check.
// 30 days is 720 buckets/app — tiny. The raw per-check history (for the bar
// strip) stays in-memory in the Pool; this is only for windowed percentages.
type UptimeStore struct {
	mu   sync.Mutex
	data map[string][]bucket
	path string
}

type bucket struct {
	Hour  int64 `json:"h"` // unix seconds, truncated to the hour
	Up    int   `json:"u"` // healthy checks
	Total int   `json:"t"` // all checks
	SumMS int64 `json:"m"` // response-time sum (for averages)
}

const uptimeRetention = 31 * 24 * time.Hour

// NewUptimeStore loads any persisted buckets from path (missing file is fine).
func NewUptimeStore(path string) *UptimeStore {
	s := &UptimeStore{data: map[string][]bucket{}, path: path}
	if b, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(b, &s.data)
	}
	return s
}

// Record folds one check result into the current hour's bucket for an app.
func (s *UptimeStore) Record(id string, healthy bool, ms int64, now time.Time) {
	hour := now.Truncate(time.Hour).Unix()
	s.mu.Lock()
	defer s.mu.Unlock()
	bs := s.data[id]
	if n := len(bs); n > 0 && bs[n-1].Hour == hour {
		bs[n-1].Total++
		if healthy {
			bs[n-1].Up++
		}
		if ms > 0 {
			bs[n-1].SumMS += ms
		}
	} else {
		b := bucket{Hour: hour, Total: 1}
		if healthy {
			b.Up = 1
		}
		if ms > 0 {
			b.SumMS = ms
		}
		bs = append(bs, b)
	}
	// Prune buckets older than the retention window.
	cutoff := now.Add(-uptimeRetention).Unix()
	i := 0
	for i < len(bs) && bs[i].Hour < cutoff {
		i++
	}
	if i > 0 {
		bs = bs[i:]
	}
	s.data[id] = bs
}

// Window returns the uptime percentage for an app over the given window, and
// whether there was any data.
func (s *UptimeStore) Window(id string, window time.Duration, now time.Time) (int, bool) {
	cutoff := now.Add(-window).Unix()
	s.mu.Lock()
	defer s.mu.Unlock()
	var up, total int
	for _, b := range s.data[id] {
		if b.Hour >= cutoff {
			up += b.Up
			total += b.Total
		}
	}
	if total == 0 {
		return 0, false
	}
	return up * 100 / total, true
}

// Windows returns {24h,7d,30d} uptime percentages for one app (-1 when no data).
func (s *UptimeStore) Windows(id string, now time.Time) map[string]int {
	out := map[string]int{}
	for k, w := range map[string]time.Duration{"24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour, "30d": 30 * 24 * time.Hour} {
		if pct, ok := s.Window(id, w, now); ok {
			out[k] = pct
		} else {
			out[k] = -1
		}
	}
	return out
}

// Snapshot returns {24h,7d,30d} for every app that has data.
func (s *UptimeStore) Snapshot(now time.Time) map[string]map[string]int {
	s.mu.Lock()
	ids := make([]string, 0, len(s.data))
	for id := range s.data {
		ids = append(ids, id)
	}
	s.mu.Unlock()
	out := make(map[string]map[string]int, len(ids))
	for _, id := range ids {
		out[id] = s.Windows(id, now)
	}
	return out
}

// Save writes the buckets to disk atomically.
func (s *UptimeStore) Save() error {
	if s.path == "" {
		return nil
	}
	s.mu.Lock()
	// Deterministic key order keeps the file diff-stable.
	ids := make([]string, 0, len(s.data))
	for id := range s.data {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	ordered := make(map[string][]bucket, len(ids))
	for _, id := range ids {
		ordered[id] = s.data[id]
	}
	s.mu.Unlock()
	b, err := json.Marshal(ordered)
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}
