package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// Dist returns the embedded SPA filesystem rooted at the dist/ directory.
// In dev (no built frontend), the dist/ directory may be empty — callers
// should fall back to serving via Vite in that case.
func Dist() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}

// HasIndex reports whether the embedded dist actually contains an index.html.
// Useful to decide whether to mount the SPA fallback or skip it in dev.
func HasIndex() bool {
	sub, err := Dist()
	if err != nil {
		return false
	}
	_, err = fs.Stat(sub, "index.html")
	return err == nil
}
