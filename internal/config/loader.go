package config

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

// yaml.v3 embeds the failing line in its error message ("yaml: line 12: ...",
// "line 5: cannot unmarshal ..."). Pull it out so the UI banner can point at
// the exact spot instead of leaving its "(line N)" slot empty.
var yamlLineRe = regexp.MustCompile(`line (\d+)`)

func parseYAMLLine(msg string) int {
	if m := yamlLineRe.FindStringSubmatch(msg); m != nil {
		n, _ := strconv.Atoi(m[1])
		return n
	}
	return 0
}

// LoadError carries enough info for the UI to render a banner pointing at the
// exact spot in config.yaml that failed.
type LoadError struct {
	Path    string
	Message string
	Line    int
	Column  int
}

func (e *LoadError) Error() string {
	if e.Line > 0 {
		return fmt.Sprintf("%s:%d:%d: %s", e.Path, e.Line, e.Column, e.Message)
	}
	return fmt.Sprintf("%s: %s", e.Path, e.Message)
}

// Load reads, parses, and validates the YAML config at path.
func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, &LoadError{Path: path, Message: err.Error()}
	}
	var cfg Config
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		var typeErr *yaml.TypeError
		if errors.As(err, &typeErr) && len(typeErr.Errors) > 0 {
			msg := typeErr.Errors[0]
			return nil, &LoadError{Path: path, Message: msg, Line: parseYAMLLine(msg)}
		}
		return nil, &LoadError{Path: path, Message: err.Error(), Line: parseYAMLLine(err.Error())}
	}
	if err := validate(&cfg); err != nil {
		return nil, &LoadError{Path: path, Message: err.Error()}
	}
	applyDefaults(&cfg)
	return &cfg, nil
}

func applyDefaults(cfg *Config) {
	if cfg.Server.Bind == "" {
		cfg.Server.Bind = ":8080"
	}
	for i := range cfg.Apps {
		h := cfg.Apps[i].Health
		if h == nil {
			continue
		}
		if h.Interval == 0 {
			h.Interval = Duration(60 * time.Second)
		}
		if h.Timeout == 0 {
			h.Timeout = Duration(5 * time.Second)
		}
		if h.Type == HealthHTTP && h.ExpectStatus == 0 {
			h.ExpectStatus = 200
		}
	}
}

// Validate checks a config for internal consistency (unique ids, resolvable
// group refs, valid health types, required fields, a single default dashboard).
// Exported so the API's PUT /api/config path can reject bad payloads before
// they're written to disk. Load() calls it too, after unmarshalling.
func Validate(cfg *Config) error { return validate(cfg) }

// ValidateBytes parses raw YAML and validates it without touching disk. Used by
// the in-app config editor to check an edit before writing it verbatim.
func ValidateBytes(raw []byte) error {
	var cfg Config
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		var typeErr *yaml.TypeError
		if errors.As(err, &typeErr) && len(typeErr.Errors) > 0 {
			return errors.New(typeErr.Errors[0])
		}
		return err
	}
	return validate(&cfg)
}

func validate(cfg *Config) error {
	appIDs := make(map[string]bool, len(cfg.Apps))
	for i, app := range cfg.Apps {
		if app.ID == "" {
			return fmt.Errorf("apps[%d]: id is required", i)
		}
		if appIDs[app.ID] {
			return fmt.Errorf("apps[%d]: duplicate id %q", i, app.ID)
		}
		appIDs[app.ID] = true
		if app.Name == "" {
			return fmt.Errorf("apps[%d] (%s): name is required", i, app.ID)
		}
		if app.URL == "" {
			return fmt.Errorf("apps[%d] (%s): url is required", i, app.ID)
		}
		if app.Health != nil {
			switch app.Health.Type {
			case HealthHTTP:
				if app.Health.URL == "" {
					return fmt.Errorf("apps[%d] (%s): health.url is required for type=http", i, app.ID)
				}
			case HealthTCP:
				if app.Health.Host == "" || app.Health.Port == 0 {
					return fmt.Errorf("apps[%d] (%s): health.host and health.port are required for type=tcp", i, app.ID)
				}
			case HealthPing:
				if app.Health.Host == "" {
					return fmt.Errorf("apps[%d] (%s): health.host is required for type=ping", i, app.ID)
				}
			case HealthNone, "":
				// none = no check; empty type tolerated as none.
			default:
				return fmt.Errorf("apps[%d] (%s): unknown health.type %q (want http|tcp|none)", i, app.ID, app.Health.Type)
			}
		}
	}

	groupIDs := make(map[string]bool, len(cfg.Groups))
	for i, g := range cfg.Groups {
		if g.ID == "" {
			return fmt.Errorf("groups[%d]: id is required", i)
		}
		if groupIDs[g.ID] {
			return fmt.Errorf("groups[%d]: duplicate id %q", i, g.ID)
		}
		groupIDs[g.ID] = true
	}

	// Apps may reference a group id; warn-style would be nicer but for now treat
	// dangling refs as an error so config is always self-consistent.
	for i, app := range cfg.Apps {
		if app.Group != "" && !groupIDs[app.Group] {
			return fmt.Errorf("apps[%d] (%s): group %q is not defined under groups:", i, app.ID, app.Group)
		}
	}

	dashIDs := make(map[string]bool, len(cfg.Dashboards))
	defaultCount := 0
	for i, d := range cfg.Dashboards {
		if d.ID == "" {
			return fmt.Errorf("dashboards[%d]: id is required", i)
		}
		if dashIDs[d.ID] {
			return fmt.Errorf("dashboards[%d]: duplicate id %q", i, d.ID)
		}
		dashIDs[d.ID] = true
		if d.Default {
			defaultCount++
		}
		widgetIDs := make(map[string]bool, len(d.Widgets))
		for j, w := range d.Widgets {
			if w.ID == "" {
				return fmt.Errorf("dashboards[%d] (%s) widgets[%d]: id is required", i, d.ID, j)
			}
			if widgetIDs[w.ID] {
				return fmt.Errorf("dashboards[%d] (%s) widgets[%d]: duplicate widget id %q", i, d.ID, j, w.ID)
			}
			widgetIDs[w.ID] = true
			if w.Type == "" {
				return fmt.Errorf("dashboards[%d] (%s) widgets[%d] (%s): type is required", i, d.ID, j, w.ID)
			}
		}
	}
	if defaultCount > 1 {
		return fmt.Errorf("multiple dashboards marked as default; pick one")
	}
	return nil
}
