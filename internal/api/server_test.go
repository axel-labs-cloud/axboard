package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

// TestGetConfigRoundTrip guards the GET /api/config DTO: every appearance field
// (global top bar + per-dashboard background/accent) must survive serialization.
// A previous regression dropped these because the hand-written output struct
// forgot to copy them — this test would have caught it.
func TestGetConfigRoundTrip(t *testing.T) {
	s := NewServer("", "", nil, nil, nil)
	s.SetConfig(&config.Config{
		TopBar: &config.TopBar{
			BarStyle: "solid",
			Header:   &config.Header{Clock: true, BarFlush: true, BrandText: "home"},
		},
		Dashboards: []config.Dashboard{{
			ID:      "home",
			Name:    "Home",
			Default: true,
			Accent:  "#00e5ff",
			Background: &config.Background{
				Type: "gradient", Gradient: "linear-gradient(#000,#fff)", Opacity: 80,
			},
			Widgets: []config.Widget{{ID: "w1", Type: "clock", Title: "Clock"}},
		}},
	})

	rec := httptest.NewRecorder()
	s.handleGetConfig(rec, httptest.NewRequest(http.MethodGet, "/api/config", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var out struct {
		TopBar *struct {
			BarStyle string         `json:"barStyle"`
			Header   *config.Header `json:"header"`
		} `json:"topBar"`
		Dashboards []struct {
			Accent     string             `json:"accent"`
			Background *config.Background `json:"background"`
			Widgets    []struct {
				I string `json:"i"`
			} `json:"widgets"`
		} `json:"dashboards"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if out.TopBar == nil || out.TopBar.BarStyle != "solid" {
		t.Errorf("topBar.barStyle not preserved: %+v", out.TopBar)
	}
	if out.TopBar == nil || out.TopBar.Header == nil || !out.TopBar.Header.BarFlush {
		t.Errorf("topBar.header not preserved")
	}
	if len(out.Dashboards) != 1 {
		t.Fatalf("dashboards len = %d, want 1", len(out.Dashboards))
	}
	d := out.Dashboards[0]
	if d.Accent != "#00e5ff" {
		t.Errorf("accent not preserved: %q", d.Accent)
	}
	if d.Background == nil || d.Background.Type != "gradient" || d.Background.Opacity != 80 {
		t.Errorf("background not preserved: %+v", d.Background)
	}
	if len(d.Widgets) != 1 || d.Widgets[0].I != "w1" {
		t.Errorf("widget id should serialize as 'i': %+v", d.Widgets)
	}
}

// TestVersionEndpoint checks the build-info handler responds with the fields
// the UI footer reads.
func TestVersionEndpoint(t *testing.T) {
	rec := httptest.NewRecorder()
	handleVersion(rec, httptest.NewRequest(http.MethodGet, "/api/version", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	var v map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, ok := v["version"]; !ok {
		t.Errorf("missing version field: %v", v)
	}
}
