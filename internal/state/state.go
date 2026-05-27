package state

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

// GridItem mirrors the react-grid-layout v1 GridItem shape. Kept as plain
// fields with explicit tags so the JSON shape sent to the frontend matches
// what react-grid-layout expects.
type GridItem struct {
	I      string `yaml:"i" json:"i"`
	X      int    `yaml:"x" json:"x"`
	Y      int    `yaml:"y" json:"y"`
	W      int    `yaml:"w" json:"w"`
	H      int    `yaml:"h" json:"h"`
	MinW   int    `yaml:"minW,omitempty" json:"minW,omitempty"`
	MinH   int    `yaml:"minH,omitempty" json:"minH,omitempty"`
	MaxW   int    `yaml:"maxW,omitempty" json:"maxW,omitempty"`
	MaxH   int    `yaml:"maxH,omitempty" json:"maxH,omitempty"`
	Static bool   `yaml:"static,omitempty" json:"static,omitempty"`
}

// State is machine-owned. Layouts keyed by dashboard ID. WidgetConfigs is a
// per-widget-instance override that the server merges into config.yaml's
// widget config on read. lastActive is the dashboard the user last had open.
type State struct {
	Layouts       map[string][]GridItem     `yaml:"layouts,omitempty" json:"layouts,omitempty"`
	WidgetConfigs map[string]map[string]any `yaml:"widget_configs,omitempty" json:"widgetConfigs,omitempty"`
	LastActive    string                    `yaml:"last_active,omitempty" json:"lastActive,omitempty"`
}

// Store wraps the on-disk state file with a mutex. Save is atomic (write to
// .tmp then rename) and serialised through the mutex so concurrent writers
// can't corrupt the file.
type Store struct {
	mu    sync.Mutex
	path  string
	state *State
}

const header = "# managed by ianua — do not edit\n"

func New(path string) *Store {
	return &Store{path: path, state: &State{}}
}

// Load reads the file if it exists. Missing file = empty state.
func (s *Store) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.state = &State{}
			return nil
		}
		return err
	}
	var st State
	if err := yaml.Unmarshal(data, &st); err != nil {
		return fmt.Errorf("parse %s: %w", s.path, err)
	}
	s.state = &st
	return nil
}

// Get returns a deep-ish copy of the current state (shallow on maps, which is
// fine for reads — callers should not mutate the returned value).
func (s *Store) Get() *State {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state == nil {
		return &State{}
	}
	// Return the pointer; callers must treat as read-only.
	return s.state
}

// Save replaces the in-memory state and atomically writes it to disk.
func (s *Store) Save(next *State) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if next == nil {
		next = &State{}
	}

	dir := filepath.Dir(s.path)
	tmp, err := os.CreateTemp(dir, ".ianua-state-*.yaml")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpPath) }
	defer func() {
		if tmp != nil {
			_ = tmp.Close()
			cleanup()
		}
	}()

	if _, err := tmp.WriteString(header); err != nil {
		return err
	}
	enc := yaml.NewEncoder(tmp)
	enc.SetIndent(2)
	if err := enc.Encode(next); err != nil {
		return err
	}
	if err := enc.Close(); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	tmp = nil
	if err := os.Rename(tmpPath, s.path); err != nil {
		cleanup()
		return fmt.Errorf("rename: %w", err)
	}
	s.state = next
	return nil
}
