package health

import (
	"path/filepath"
	"testing"
	"time"
)

func TestUptimeWindowsAndPersist(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "uptime.json")
	s := NewUptimeStore(path)
	base := time.Date(2026, 1, 31, 12, 0, 0, 0, time.UTC)

	// 10 days ago: all down (outside 24h/7d, inside 30d).
	old := base.Add(-10 * 24 * time.Hour)
	for i := 0; i < 10; i++ {
		s.Record("a", false, 0, old.Add(time.Duration(i)*time.Minute))
	}
	// Last hour: 9 up, 1 down (inside all windows).
	for i := 0; i < 9; i++ {
		s.Record("a", true, 20, base.Add(time.Duration(i)*time.Minute))
	}
	s.Record("a", false, 0, base.Add(9*time.Minute))

	if pct, ok := s.Window("a", 24*time.Hour, base.Add(10*time.Minute)); !ok || pct != 90 {
		t.Errorf("24h uptime = %d (ok=%v), want 90", pct, ok)
	}
	// 30d includes the 10 down + 10 recent (9 up) = 9/20 = 45%.
	if pct, ok := s.Window("a", 30*24*time.Hour, base.Add(10*time.Minute)); !ok || pct != 45 {
		t.Errorf("30d uptime = %d (ok=%v), want 45", pct, ok)
	}
	if _, ok := s.Window("missing", time.Hour, base); ok {
		t.Error("missing app should have no data")
	}

	// Persist + reload.
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	s2 := NewUptimeStore(path)
	if pct, ok := s2.Window("a", 24*time.Hour, base.Add(10*time.Minute)); !ok || pct != 90 {
		t.Errorf("reloaded 24h uptime = %d (ok=%v), want 90", pct, ok)
	}
}
