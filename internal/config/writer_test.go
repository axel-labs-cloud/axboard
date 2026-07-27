package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveRawPreservesVerbatimAndValidates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")

	valid := `# a hand-written comment
server:
  bind: ":8080"
apps:
  - id: sonarr
    name: Sonarr
    url: https://sonarr.lan
`
	if err := SaveRaw(path, []byte(valid)); err != nil {
		t.Fatalf("SaveRaw(valid): %v", err)
	}
	got, _ := os.ReadFile(path)
	if string(got) != valid {
		t.Errorf("SaveRaw did not write bytes verbatim:\n%s", got)
	}
	if !strings.Contains(string(got), "# a hand-written comment") {
		t.Errorf("comment not preserved")
	}

	// Invalid config (duplicate id) must be rejected and leave the file intact.
	invalid := `apps:
  - id: dup
    name: A
    url: u
  - id: dup
    name: B
    url: u
`
	if err := SaveRaw(path, []byte(invalid)); err == nil {
		t.Fatal("SaveRaw(invalid) should have errored")
	}
	after, _ := os.ReadFile(path)
	if string(after) != valid {
		t.Errorf("rejected save must not modify the existing file")
	}
}

func TestValidateBytes(t *testing.T) {
	if err := ValidateBytes([]byte("apps: [ {id: a, name: A, url: u} ]")); err != nil {
		t.Errorf("valid: %v", err)
	}
	if err := ValidateBytes([]byte("apps: [ {name: A, url: u} ]")); err == nil {
		t.Error("missing id should error")
	}
	if err := ValidateBytes([]byte("apps: [ : bad")); err == nil {
		t.Error("malformed yaml should error")
	}
}
