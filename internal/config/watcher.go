package config

import (
	"context"
	"log/slog"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

// WatchEvent is delivered to the watcher callback on every successful or failed
// reload. Exactly one of Config or Err is non-nil.
type WatchEvent struct {
	Config *Config
	Err    error
}

// Watch tails the config file. Reloads are debounced (250ms) to coalesce the
// 2-3 events editors emit when atomic-renaming a file on save. The first
// callback invocation happens synchronously with the initial Load — callers
// don't need to call Load separately.
func Watch(ctx context.Context, path string, debounce time.Duration, cb func(WatchEvent)) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	// Watch the directory rather than the file: editors often atomic-rename
	// (tmp -> target), which removes the original inode the watcher was bound
	// to. Directory-level watching survives the rename.
	dir := filepath.Dir(path)
	if err := w.Add(dir); err != nil {
		_ = w.Close()
		return err
	}

	// Initial load.
	cfg, loadErr := Load(path)
	cb(WatchEvent{Config: cfg, Err: loadErr})

	if debounce <= 0 {
		debounce = 250 * time.Millisecond
	}

	go func() {
		defer w.Close()
		var timer *time.Timer
		fire := func() {
			cfg, err := Load(path)
			cb(WatchEvent{Config: cfg, Err: err})
		}
		for {
			select {
			case <-ctx.Done():
				return
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if filepath.Clean(ev.Name) != filepath.Clean(path) {
					continue
				}
				// Reload on any event for the watched file. Editors do
				// CREATE+RENAME+WRITE; we don't try to distinguish.
				if timer != nil {
					timer.Stop()
				}
				timer = time.AfterFunc(debounce, fire)
			case err, ok := <-w.Errors:
				if !ok {
					return
				}
				slog.Warn("config watcher error", "err", err)
			}
		}
	}()

	return nil
}
