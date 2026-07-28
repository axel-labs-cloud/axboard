package config

import (
	"path/filepath"
	"testing"
)

// TestExampleConfigLoads ensures the shipped config.example.yaml always parses
// and validates — it's the documented starting point, so a broken one is a bug.
func TestExampleConfigLoads(t *testing.T) {
	path := filepath.Join("..", "..", "config.example.yaml")
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("example config failed to load: %v", err)
	}
	if len(cfg.Apps) == 0 || len(cfg.Dashboards) == 0 {
		t.Fatalf("example config looks empty: %d apps, %d dashboards", len(cfg.Apps), len(cfg.Dashboards))
	}
	if cfg.TopBar == nil || cfg.TopBar.Header == nil {
		t.Errorf("example config should demonstrate the global topBar")
	}
}

// TestShowcaseConfigLoads keeps the all-widgets showcase config valid.
func TestShowcaseConfigLoads(t *testing.T) {
	cfg, err := Load(filepath.Join("..", "..", "config.showcase.yaml"))
	if err != nil {
		t.Fatalf("showcase config failed to load: %v", err)
	}
	if len(cfg.Dashboards) < 3 {
		t.Errorf("showcase should have several dashboards, got %d", len(cfg.Dashboards))
	}
}
