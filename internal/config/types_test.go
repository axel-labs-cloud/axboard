package config

import (
	"encoding/json"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

func TestDurationYAMLRoundTrip(t *testing.T) {
	cases := []struct {
		in   string
		want time.Duration
	}{
		{`"60s"`, 60 * time.Second},
		{`"5m"`, 5 * time.Minute},
		{`""`, 0},
		{`5m`, 5 * time.Minute}, // unquoted string scalar
	}
	for _, c := range cases {
		var d Duration
		if err := yaml.Unmarshal([]byte(c.in), &d); err != nil {
			t.Fatalf("yaml unmarshal %q: %v", c.in, err)
		}
		if d.Duration() != c.want {
			t.Errorf("yaml %q: got %v want %v", c.in, d.Duration(), c.want)
		}
	}

	// Invalid string must error, not silently zero. In YAML a bare number
	// decodes as a string scalar, so it also fails ParseDuration (the numeric
	// fallback only applies to JSON) — assert that rather than silent success.
	for _, bad := range []string{`"not-a-duration"`, `1500000000`} {
		var d Duration
		if err := yaml.Unmarshal([]byte(bad), &d); err == nil {
			t.Errorf("expected error on invalid duration %q, got nil", bad)
		}
	}

	// Marshal round-trips through a string form.
	out, err := yaml.Marshal(Duration(90 * time.Second))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var back Duration
	if err := yaml.Unmarshal(out, &back); err != nil {
		t.Fatalf("re-unmarshal: %v", err)
	}
	if back.Duration() != 90*time.Second {
		t.Errorf("round-trip: got %v want 1m30s", back.Duration())
	}
}

func TestDurationJSONRoundTrip(t *testing.T) {
	cases := []struct {
		in   string
		want time.Duration
	}{
		{`"60s"`, 60 * time.Second},
		{`""`, 0},
		{`null`, 0},
		{`1500000000`, 1500 * time.Millisecond},
	}
	for _, c := range cases {
		var d Duration
		if err := json.Unmarshal([]byte(c.in), &d); err != nil {
			t.Fatalf("json unmarshal %q: %v", c.in, err)
		}
		if d.Duration() != c.want {
			t.Errorf("json %q: got %v want %v", c.in, d.Duration(), c.want)
		}
	}

	var bad Duration
	if err := json.Unmarshal([]byte(`"nope"`), &bad); err == nil {
		t.Errorf("expected error on invalid duration string, got nil")
	}

	// Server emits a quoted string; the client round-trips it back on PUT.
	b, err := json.Marshal(Duration(30 * time.Second))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(b) != `"30s"` {
		t.Errorf("marshal: got %s want \"30s\"", b)
	}
	var back Duration
	if err := json.Unmarshal(b, &back); err != nil {
		t.Fatalf("re-unmarshal: %v", err)
	}
	if back.Duration() != 30*time.Second {
		t.Errorf("json round-trip: got %v want 30s", back.Duration())
	}
}
