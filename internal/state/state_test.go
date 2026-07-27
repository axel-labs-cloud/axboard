package state

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestSaveLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.yaml")
	s := New(path)

	in := &State{
		Layouts: map[string][]GridItem{
			"home": {{I: "w1", X: 0, Y: 0, W: 4, H: 2}},
		},
		WidgetConfigs: map[string]map[string]any{
			"w1": {"density": "compact"},
		},
		LastActive: "home",
	}
	if err := s.Save(in); err != nil {
		t.Fatalf("save: %v", err)
	}

	// Header line must be present so a human opening the file sees the warning.
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if !strings.HasPrefix(string(raw), "# managed by axboard") {
		t.Errorf("missing managed-by header, got: %q", strings.SplitN(string(raw), "\n", 2)[0])
	}

	// A fresh Store loading the same file must reproduce the state.
	s2 := New(path)
	if err := s2.Load(); err != nil {
		t.Fatalf("load: %v", err)
	}
	got := s2.Get()
	if got.LastActive != "home" {
		t.Errorf("lastActive: got %q want home", got.LastActive)
	}
	if len(got.Layouts["home"]) != 1 || got.Layouts["home"][0].W != 4 {
		t.Errorf("layouts round-trip mismatch: %+v", got.Layouts)
	}
	if got.WidgetConfigs["w1"]["density"] != "compact" {
		t.Errorf("widgetConfigs round-trip mismatch: %+v", got.WidgetConfigs)
	}
}

func TestLoadMissingFileIsEmpty(t *testing.T) {
	s := New(filepath.Join(t.TempDir(), "does-not-exist.yaml"))
	if err := s.Load(); err != nil {
		t.Fatalf("load of missing file should be nil error, got %v", err)
	}
	if got := s.Get(); got == nil || len(got.Layouts) != 0 {
		t.Errorf("expected empty state, got %+v", got)
	}
}

// TestConcurrentSaveNoCorruption hammers Save from many goroutines and asserts
// the file always parses as valid YAML (the atomic write-then-rename must never
// leave a half-written file). Run with -race.
func TestConcurrentSaveNoCorruption(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.yaml")
	s := New(path)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			st := &State{
				LastActive: "d",
				Layouts: map[string][]GridItem{
					"d": {{I: "w", X: n, Y: n, W: 1, H: 1}},
				},
			}
			if err := s.Save(st); err != nil {
				t.Errorf("save %d: %v", n, err)
			}
		}(i)
	}
	wg.Wait()

	// Final file must be parseable — no torn write survived.
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var out State
	if err := yaml.Unmarshal(raw, &out); err != nil {
		t.Fatalf("final file is not valid YAML: %v", err)
	}
}
