package config

import (
	"strings"
	"testing"
	"time"
)

// app is a small helper to build a valid App that individual cases mutate.
func validApp() App {
	return App{ID: "sonarr", Name: "Sonarr", URL: "https://sonarr.lan"}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr string // substring; "" means expect success
	}{
		{
			name: "minimal valid",
			cfg:  Config{Apps: []App{validApp()}},
		},
		{
			name:    "app missing id",
			cfg:     Config{Apps: []App{{Name: "x", URL: "u"}}},
			wantErr: "id is required",
		},
		{
			name: "duplicate app id",
			cfg: Config{Apps: []App{
				validApp(),
				{ID: "sonarr", Name: "Other", URL: "u"},
			}},
			wantErr: "duplicate id",
		},
		{
			name:    "app missing name",
			cfg:     Config{Apps: []App{{ID: "a", URL: "u"}}},
			wantErr: "name is required",
		},
		{
			name:    "app missing url",
			cfg:     Config{Apps: []App{{ID: "a", Name: "A"}}},
			wantErr: "url is required",
		},
		{
			name: "http health missing url",
			cfg: Config{Apps: []App{{
				ID: "a", Name: "A", URL: "u",
				Health: &Health{Type: HealthHTTP},
			}}},
			wantErr: "health.url is required",
		},
		{
			name: "tcp health missing host/port",
			cfg: Config{Apps: []App{{
				ID: "a", Name: "A", URL: "u",
				Health: &Health{Type: HealthTCP},
			}}},
			wantErr: "health.host and health.port",
		},
		{
			name: "unknown health type",
			cfg: Config{Apps: []App{{
				ID: "a", Name: "A", URL: "u",
				Health: &Health{Type: "icmp"},
			}}},
			wantErr: "unknown health.type",
		},
		{
			name: "health none is allowed",
			cfg: Config{Apps: []App{{
				ID: "a", Name: "A", URL: "u",
				Health: &Health{Type: HealthNone},
			}}},
		},
		{
			name: "dangling group ref",
			cfg: Config{Apps: []App{{
				ID: "a", Name: "A", URL: "u", Group: "ghost",
			}}},
			wantErr: `group "ghost" is not defined`,
		},
		{
			name: "resolvable group ref",
			cfg: Config{
				Apps:   []App{{ID: "a", Name: "A", URL: "u", Group: "media"}},
				Groups: []Group{{ID: "media", Name: "Media"}},
			},
		},
		{
			name:    "duplicate group id",
			cfg:     Config{Groups: []Group{{ID: "g"}, {ID: "g"}}},
			wantErr: "duplicate id",
		},
		{
			name:    "dashboard missing id",
			cfg:     Config{Dashboards: []Dashboard{{Name: "Home"}}},
			wantErr: "dashboards[0]: id is required",
		},
		{
			name: "duplicate widget id within dashboard",
			cfg: Config{Dashboards: []Dashboard{{
				ID: "home", Name: "Home",
				Widgets: []Widget{
					{ID: "w1", Type: "clock", Title: "A"},
					{ID: "w1", Type: "apps", Title: "B"},
				},
			}}},
			wantErr: "duplicate widget id",
		},
		{
			name: "widget missing type",
			cfg: Config{Dashboards: []Dashboard{{
				ID: "home", Name: "Home",
				Widgets: []Widget{{ID: "w1", Title: "A"}},
			}}},
			wantErr: "type is required",
		},
		{
			name: "more than one default dashboard",
			cfg: Config{Dashboards: []Dashboard{
				{ID: "a", Name: "A", Default: true},
				{ID: "b", Name: "B", Default: true},
			}},
			wantErr: "multiple dashboards marked as default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate(&tt.cfg)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("expected no error, got %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got %q", tt.wantErr, err.Error())
			}
		})
	}
}

func TestApplyDefaults(t *testing.T) {
	cfg := Config{Apps: []App{{
		ID: "a", Name: "A", URL: "u",
		Health: &Health{Type: HealthHTTP, URL: "u/ping"},
	}}}
	applyDefaults(&cfg)

	if cfg.Server.Bind != ":8080" {
		t.Errorf("default bind: got %q want :8080", cfg.Server.Bind)
	}
	h := cfg.Apps[0].Health
	if h.Interval != Duration(60*time.Second) {
		t.Errorf("default interval: got %v want 60s", h.Interval.Duration())
	}
	if h.Timeout != Duration(5*time.Second) {
		t.Errorf("default timeout: got %v want 5s", h.Timeout.Duration())
	}
	if h.ExpectStatus != 200 {
		t.Errorf("default expect_status: got %d want 200", h.ExpectStatus)
	}
}
