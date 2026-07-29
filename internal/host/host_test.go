package host

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeFile is a small helper that creates parent dirs.
func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestReadCPU(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "stat"), strings.Join([]string{
		"cpu  100 0 100 800 0 0 0 0 0 0", // busy=200 total=1000 → idle 800
		"cpu0 50 0 50 400 0 0 0 0 0 0",
		"cpu1 50 0 50 400 0 0 0 0 0 0",
		"intr 123",
	}, "\n"))
	old := procRoot
	procRoot = dir
	defer func() { procRoot = old }()

	busy, total, perB, perT := readCPU()
	if busy != 200 || total != 1000 {
		t.Errorf("aggregate busy=%d total=%d want 200/1000", busy, total)
	}
	if len(perB) != 2 || len(perT) != 2 {
		t.Fatalf("per-core len = %d/%d want 2/2", len(perB), len(perT))
	}
	if perB[0] != 100 || perT[0] != 500 {
		t.Errorf("cpu0 busy=%d total=%d want 100/500", perB[0], perT[0])
	}
}

func TestGatherFilesystems(t *testing.T) {
	dir := t.TempDir()
	// A real (ext4) mount, a tmpfs (ignored), and an nfs mount — pointed at
	// temp dirs so statfs succeeds.
	real := filepath.Join(dir, "root")
	nfs := filepath.Join(dir, "nfs")
	os.MkdirAll(real, 0o755)
	os.MkdirAll(nfs, 0o755)
	writeFile(t, filepath.Join(dir, "mounts"), strings.Join([]string{
		"/dev/sda1 " + real + " ext4 rw 0 0",
		"tmpfs /run tmpfs rw 0 0",
		"srv:/export " + nfs + " nfs rw 0 0",
	}, "\n"))
	old := procRoot
	procRoot = dir
	defer func() { procRoot = old }()

	fs := gatherFilesystems()
	if len(fs) != 2 {
		t.Fatalf("got %d filesystems, want 2 (ext4 + nfs, tmpfs skipped): %+v", len(fs), fs)
	}
	types := map[string]bool{}
	for _, f := range fs {
		types[f.Type] = true
		if f.Total == 0 {
			t.Errorf("%s has zero total", f.Path)
		}
	}
	if !types["ext4"] || !types["nfs"] {
		t.Errorf("expected ext4 and nfs, got %+v", types)
	}
}

func TestGatherTemps(t *testing.T) {
	base := t.TempDir()
	// hwmon0 = nvme with two temps (one labelled), hwmon1 = a duplicate chip.
	writeFile(t, filepath.Join(base, "hwmon0", "name"), "nvme")
	writeFile(t, filepath.Join(base, "hwmon0", "temp1_input"), "47000")
	writeFile(t, filepath.Join(base, "hwmon0", "temp1_label"), "Composite")
	writeFile(t, filepath.Join(base, "hwmon0", "temp2_input"), "50000")
	writeFile(t, filepath.Join(base, "hwmon1", "name"), "nvme")
	writeFile(t, filepath.Join(base, "hwmon1", "temp1_input"), "40000")
	writeFile(t, filepath.Join(base, "hwmon1", "temp1_label"), "Composite")

	old := hwmonBase
	hwmonBase = base
	defer func() { hwmonBase = old }()

	temps := gatherTemps()
	if len(temps) != 3 {
		t.Fatalf("got %d temps want 3: %+v", len(temps), temps)
	}
	// Labels must be unique so they can be toggled individually.
	seen := map[string]bool{}
	for _, tp := range temps {
		if seen[tp.Label] {
			t.Errorf("duplicate label %q", tp.Label)
		}
		seen[tp.Label] = true
		if tp.Celsius <= 0 {
			t.Errorf("%s has non-positive temp %v", tp.Label, tp.Celsius)
		}
	}
	if !seen["nvme Composite"] {
		t.Errorf("expected chip-qualified 'nvme Composite', got %+v", seen)
	}
}

func TestTopProcs(t *testing.T) {
	dir := t.TempDir()
	// Two processes; comm may contain spaces/parens.
	writeFile(t, filepath.Join(dir, "101", "stat"),
		"101 (my proc) S 1 0 0 0 -1 0 0 0 0 0 500 100 0 0 20 0 1 0 0 0 4096 0")
	writeFile(t, filepath.Join(dir, "102", "stat"),
		"102 (other) S 1 0 0 0 -1 0 0 0 0 0 10 5 0 0 20 0 1 0 0 0 8192 0")
	old := procRoot
	procRoot = dir
	defer func() { procRoot = old }()

	// First call primes the previous-sample map (CPU deltas need two samples).
	first := TopProcs(5)
	if len(first) != 2 {
		t.Fatalf("got %d procs want 2", len(first))
	}
	// Names parse correctly despite the space in "my proc".
	names := map[string]bool{}
	for _, p := range first {
		names[p.Name] = true
	}
	if !names["my proc"] || !names["other"] {
		t.Errorf("bad name parse: %+v", names)
	}
}
