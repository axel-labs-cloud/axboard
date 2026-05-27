package config

import (
	"fmt"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server     ServerConfig `yaml:"server" json:"server"`
	Apps       []App        `yaml:"apps,omitempty" json:"apps,omitempty"`
	Groups     []Group      `yaml:"groups,omitempty" json:"groups,omitempty"`
	Dashboards []Dashboard  `yaml:"dashboards,omitempty" json:"dashboards,omitempty"`
}

type ServerConfig struct {
	Bind string `yaml:"bind,omitempty" json:"bind,omitempty"`
}

type App struct {
	ID          string  `yaml:"id" json:"id"`
	Name        string  `yaml:"name" json:"name"`
	URL         string  `yaml:"url" json:"url"`
	Icon        string  `yaml:"icon,omitempty" json:"icon,omitempty"`
	Group       string  `yaml:"group,omitempty" json:"group,omitempty"`
	Description string  `yaml:"description,omitempty" json:"description,omitempty"`
	Health      *Health `yaml:"health,omitempty" json:"health,omitempty"`
}

type HealthType string

const (
	HealthHTTP HealthType = "http"
	HealthTCP  HealthType = "tcp"
	HealthNone HealthType = "none"
)

type Health struct {
	Type         HealthType `yaml:"type" json:"type"`
	URL          string     `yaml:"url,omitempty" json:"url,omitempty"`
	Host         string     `yaml:"host,omitempty" json:"host,omitempty"`
	Port         int        `yaml:"port,omitempty" json:"port,omitempty"`
	ExpectStatus int        `yaml:"expect_status,omitempty" json:"expect_status,omitempty"`
	Interval     Duration   `yaml:"interval,omitempty" json:"interval,omitempty"`
	Timeout      Duration   `yaml:"timeout,omitempty" json:"timeout,omitempty"`
}

type Group struct {
	ID    string `yaml:"id" json:"id"`
	Name  string `yaml:"name" json:"name"`
	Color string `yaml:"color,omitempty" json:"color,omitempty"`
}

type Dashboard struct {
	ID      string   `yaml:"id" json:"id"`
	Name    string   `yaml:"name" json:"name"`
	Default bool     `yaml:"default,omitempty" json:"default,omitempty"`
	Widgets []Widget `yaml:"widgets,omitempty" json:"widgets,omitempty"`
}

type Widget struct {
	// Stored as `id` in YAML for human readability, but the React grid layout
	// keys widgets by `i`, so the JSON shape uses `i` to match the frontend.
	ID     string         `yaml:"id" json:"i"`
	Type   string         `yaml:"type" json:"type"`
	Title  string         `yaml:"title" json:"title"`
	Config map[string]any `yaml:"config,omitempty" json:"config,omitempty"`
}

// Duration wraps time.Duration so it can unmarshal "60s" / "5m" style strings
// out of YAML and JSON.
type Duration time.Duration

func (d Duration) Duration() time.Duration { return time.Duration(d) }

func (d *Duration) UnmarshalYAML(node *yaml.Node) error {
	var s string
	if err := node.Decode(&s); err != nil {
		// Fall back to numeric (nanoseconds) just in case.
		var n int64
		if err2 := node.Decode(&n); err2 != nil {
			return fmt.Errorf("duration: not a string or number: %w", err)
		}
		*d = Duration(n)
		return nil
	}
	if s == "" {
		*d = 0
		return nil
	}
	parsed, err := time.ParseDuration(s)
	if err != nil {
		return fmt.Errorf("duration %q: %w", s, err)
	}
	*d = Duration(parsed)
	return nil
}

func (d Duration) MarshalYAML() (any, error) {
	if d == 0 {
		return "", nil
	}
	return time.Duration(d).String(), nil
}

func (d Duration) MarshalJSON() ([]byte, error) {
	return []byte(`"` + time.Duration(d).String() + `"`), nil
}
