package config

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server     ServerConfig    `yaml:"server" json:"server"`
	Alerts     AlertsConfig    `yaml:"alerts,omitempty" json:"alerts,omitempty"`
	Discovery  DiscoveryConfig `yaml:"discovery,omitempty" json:"discovery,omitempty"`
	Apps       []App           `yaml:"apps,omitempty" json:"apps,omitempty"`
	Groups     []Group         `yaml:"groups,omitempty" json:"groups,omitempty"`
	TopBar     *TopBar         `yaml:"topBar,omitempty" json:"topBar,omitempty"`
	Dashboards []Dashboard     `yaml:"dashboards,omitempty" json:"dashboards,omitempty"`
}

// TopBar is global (shared across all dashboards): the bar style and the header
// configuration (branding, search, widgets, bookmarks, flush mode).
type TopBar struct {
	BarStyle string  `yaml:"barStyle,omitempty" json:"barStyle,omitempty"`
	Header   *Header `yaml:"header,omitempty" json:"header,omitempty"`
}

// DiscoveryConfig configures the auto-discover feature. When a Docker/Podman
// socket is reachable, axboard suggests services derived from container labels.
type DiscoveryConfig struct {
	// DockerSocket is the path to a Docker-API-compatible socket inside the
	// container (Podman's socket works). Defaults to /var/run/docker.sock.
	DockerSocket string `yaml:"docker_socket,omitempty" json:"docker_socket,omitempty"`
}

type ServerConfig struct {
	Bind string `yaml:"bind,omitempty" json:"bind,omitempty"`
}

// AlertsConfig configures optional outbound notifications. When webhook_url is
// set, axboard POSTs a small JSON payload when an app goes down or recovers.
type AlertsConfig struct {
	WebhookURL string `yaml:"webhook_url,omitempty" json:"webhook_url,omitempty"`
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
	HealthPing HealthType = "ping"
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

	// Optional HTTP-check refinements.
	// Headers are sent on the request (e.g. an auth token for a protected
	// health endpoint). BodyContains, when set, requires the response body to
	// contain the substring for a healthy result (a cheap alternative to full
	// JSON-path matching). Insecure overrides the default TLS-skip behavior:
	// nil = skip verify (homelab default), false = enforce cert validation.
	Headers      map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	BodyContains string            `yaml:"body_contains,omitempty" json:"body_contains,omitempty"`
	Insecure     *bool             `yaml:"insecure,omitempty" json:"insecure,omitempty"`
}

type Group struct {
	ID    string `yaml:"id" json:"id"`
	Name  string `yaml:"name" json:"name"`
	Color string `yaml:"color,omitempty" json:"color,omitempty"`
}

type Dashboard struct {
	ID         string      `yaml:"id" json:"id"`
	Name       string      `yaml:"name" json:"name"`
	Default    bool        `yaml:"default,omitempty" json:"default,omitempty"`
	Accent     string      `yaml:"accent,omitempty" json:"accent,omitempty"`
	Background *Background `yaml:"background,omitempty" json:"background,omitempty"`
	Widgets    []Widget    `yaml:"widgets,omitempty" json:"widgets,omitempty"`
}

// Background is the per-dashboard page backdrop behind the widget grid.
type Background struct {
	Type     string `yaml:"type,omitempty" json:"type,omitempty"` // color | gradient | image
	Color    string `yaml:"color,omitempty" json:"color,omitempty"`
	Gradient string `yaml:"gradient,omitempty" json:"gradient,omitempty"` // full CSS gradient value
	Image    string `yaml:"image,omitempty" json:"image,omitempty"`       // URL or data: URI
	Blur     int    `yaml:"blur,omitempty" json:"blur,omitempty"`         // px, image only
	Dim      int    `yaml:"dim,omitempty" json:"dim,omitempty"`           // 0-100 dark overlay
	Fit      string `yaml:"fit,omitempty" json:"fit,omitempty"`           // cover | contain | tile (image)
	Opacity  int    `yaml:"opacity,omitempty" json:"opacity,omitempty"`   // 0-100 overall (0 = use 100)
}

// Header configures the top bar: small widgets, bookmark launchers, and the
// branding / search visibility.
type Header struct {
	Clock       bool     `yaml:"clock,omitempty" json:"clock,omitempty"`
	Weather     bool     `yaml:"weather,omitempty" json:"weather,omitempty"`
	AppsUp      bool     `yaml:"appsUp,omitempty" json:"appsUp,omitempty"`
	WeatherCity string   `yaml:"weatherCity,omitempty" json:"weatherCity,omitempty"`
	WeatherLat  float64  `yaml:"weatherLat,omitempty" json:"weatherLat,omitempty"`
	WeatherLon  float64  `yaml:"weatherLon,omitempty" json:"weatherLon,omitempty"`
	Links       []string `yaml:"links,omitempty" json:"links,omitempty"` // app ids shown as bookmark icons
	HideSearch  bool     `yaml:"hideSearch,omitempty" json:"hideSearch,omitempty"`
	HideLogo    bool     `yaml:"hideLogo,omitempty" json:"hideLogo,omitempty"`
	HideName    bool     `yaml:"hideName,omitempty" json:"hideName,omitempty"`
	BrandText   string   `yaml:"brandText,omitempty" json:"brandText,omitempty"`
	BrandLogo   string   `yaml:"brandLogo,omitempty" json:"brandLogo,omitempty"` // custom logo image URL
	BarFlush    bool     `yaml:"barFlush,omitempty" json:"barFlush,omitempty"`   // edge-to-edge top bar
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

// UnmarshalJSON accepts either a string like "60s" or a numeric nanoseconds
// value. Mirrors UnmarshalYAML so PUT /api/config can round-trip the same
// shape the server emits.
func (d *Duration) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		*d = 0
		return nil
	}
	if data[0] == '"' {
		s, err := strconv.Unquote(string(data))
		if err != nil {
			return fmt.Errorf("duration: invalid quoted string: %w", err)
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
	var n int64
	if err := json.Unmarshal(data, &n); err != nil {
		return fmt.Errorf("duration: not a string or number: %w", err)
	}
	*d = Duration(n)
	return nil
}
