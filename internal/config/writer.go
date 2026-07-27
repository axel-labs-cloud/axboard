package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Save writes cfg back to path with a header comment, using atomic-rename so a
// partial write can never replace the file. Comments and ordering from the
// original file are NOT preserved — this is the documented UI-edit contract.
// Most flows should never call this; only the explicit "edit apps via UI"
// path does.
func Save(path string, cfg *Config) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".axboard-config-*.yaml")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := func() {
		_ = os.Remove(tmpPath)
	}
	defer func() {
		if tmp != nil {
			_ = tmp.Close()
			cleanup()
		}
	}()

	if _, err := tmp.WriteString("# axboard config.yaml — edit freely. UI edits will reformat and drop comments.\n"); err != nil {
		return err
	}
	enc := yaml.NewEncoder(tmp)
	enc.SetIndent(2)
	if err := enc.Encode(cfg); err != nil {
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
	if err := os.Rename(tmpPath, path); err != nil {
		cleanup()
		return fmt.Errorf("rename %s -> %s: %w", tmpPath, path, err)
	}
	return nil
}
