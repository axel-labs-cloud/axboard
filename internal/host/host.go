// Package host exposes a shallow snapshot of the machine axboard runs on —
// CPU, memory, disk, and network — for the host-stats and resource-gauge
// widgets. Deliberately not a metrics collector: point at Grafana for real
// observability. Rate fields (cpu %, disk/net throughput) are computed as the
// delta between successive Snapshot() calls, so the first call after start
// reports zero for them.
package host

import (
	"os"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Stats struct {
	CPUs      int     `json:"cpus"`
	CPUPct    float64 `json:"cpu_pct"` // overall utilisation, 0..100
	Load1     float64 `json:"load1"`
	Load5     float64 `json:"load5"`
	Load15    float64 `json:"load15"`
	MemTotal  uint64  `json:"mem_total"` // bytes
	MemUsed   uint64  `json:"mem_used"`  // bytes
	SwapTotal uint64  `json:"swap_total"`
	SwapUsed  uint64  `json:"swap_used"`
	DiskPath  string  `json:"disk_path"`
	DiskTotal uint64  `json:"disk_total"`     // bytes
	DiskUsed  uint64  `json:"disk_used"`      // bytes
	DiskRead  float64 `json:"disk_read_bps"`  // bytes/sec aggregate
	DiskWrite float64 `json:"disk_write_bps"` // bytes/sec aggregate
	NetRx     float64 `json:"net_rx_bps"`     // bytes/sec aggregate
	NetTx     float64 `json:"net_tx_bps"`     // bytes/sec aggregate
	UptimeSec float64 `json:"uptime_sec"`

	PerCPU      []float64    `json:"per_cpu"`     // per-core utilisation, 0..100
	Temps       []Temp       `json:"temps"`       // hardware temperatures
	Batteries   []Battery    `json:"batteries"`   // power supplies of type Battery/UPS
	Filesystems []Filesystem `json:"filesystems"` // mounted real filesystems
}

type Temp struct {
	Label   string  `json:"label"`
	Celsius float64 `json:"celsius"`
}

type Battery struct {
	Name   string `json:"name"`
	Pct    int    `json:"pct"`
	Status string `json:"status"`
}

type Filesystem struct {
	Path  string `json:"path"`
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
}

// Proc is one process row for the top-processes widget.
type Proc struct {
	PID  int     `json:"pid"`
	Name string  `json:"name"`
	CPU  float64 `json:"cpu"` // percent of one core-second aggregate
	RSS  uint64  `json:"rss"` // resident bytes
}

// procRoot lets a container read the host's /proc when it is bind-mounted
// (e.g. -v /proc:/host/proc:ro with AXBOARD_PROC_ROOT=/host/proc). Only
// /proc/net/dev is namespaced per-container; the rest already report host
// values. Defaults to /proc.
var procRoot = func() string {
	if r := os.Getenv("AXBOARD_PROC_ROOT"); r != "" {
		return strings.TrimRight(r, "/")
	}
	return "/proc"
}()

// diskMount is the filesystem the disk-usage gauge reports on. Defaults to "/".
var diskMount = func() string {
	if m := os.Getenv("AXBOARD_DISK_PATH"); m != "" {
		return m
	}
	return "/"
}()

// wholeDisk matches whole block devices (not partitions) in /proc/diskstats.
var wholeDisk = regexp.MustCompile(`^(sd[a-z]+|nvme\d+n\d+|vd[a-z]+|xvd[a-z]+|mmcblk\d+)$`)

// physicalNet matches physical NICs in /proc/net/dev (en*, eth*, em*, wl*,
// bond*, ib*). Whitelisting physical interfaces avoids double-counting traffic
// that also traverses a bridge (br0) the NIC is enslaved to.
var physicalNet = regexp.MustCompile(`^(en|eth|em\d|wl|bond\d|ib\d)`)

type sample struct {
	t         time.Time
	cpuBusy   uint64
	cpuTotal  uint64
	perBusy   []uint64
	perTotal  []uint64
	diskRead  uint64 // bytes
	diskWrite uint64 // bytes
	netRx     uint64 // bytes
	netTx     uint64 // bytes
}

var (
	mu   sync.Mutex
	prev sample
	have bool
)

// Snapshot reads /proc for a host view. Missing files are tolerated (fields
// stay zero) so it works on non-Linux dev machines.
func Snapshot() Stats {
	s := Stats{CPUs: runtime.NumCPU(), DiskPath: diskMount}

	if b, err := os.ReadFile(procRoot + "/loadavg"); err == nil {
		f := strings.Fields(string(b))
		if len(f) >= 3 {
			s.Load1, _ = strconv.ParseFloat(f[0], 64)
			s.Load5, _ = strconv.ParseFloat(f[1], 64)
			s.Load15, _ = strconv.ParseFloat(f[2], 64)
		}
	}

	if b, err := os.ReadFile(procRoot + "/meminfo"); err == nil {
		var total, avail, swapTotal, swapFree uint64
		for _, line := range strings.Split(string(b), "\n") {
			f := strings.Fields(line)
			if len(f) < 2 {
				continue
			}
			kb, _ := strconv.ParseUint(f[1], 10, 64)
			switch f[0] {
			case "MemTotal:":
				total = kb * 1024
			case "MemAvailable:":
				avail = kb * 1024
			case "SwapTotal:":
				swapTotal = kb * 1024
			case "SwapFree:":
				swapFree = kb * 1024
			}
		}
		s.MemTotal = total
		if total > avail {
			s.MemUsed = total - avail
		}
		s.SwapTotal = swapTotal
		if swapTotal > swapFree {
			s.SwapUsed = swapTotal - swapFree
		}
	}

	if b, err := os.ReadFile(procRoot + "/uptime"); err == nil {
		f := strings.Fields(string(b))
		if len(f) >= 1 {
			s.UptimeSec, _ = strconv.ParseFloat(f[0], 64)
		}
	}

	// Disk usage via statfs of the reported mount.
	var fs syscall.Statfs_t
	if err := syscall.Statfs(diskMount, &fs); err == nil {
		bs := uint64(fs.Bsize)
		s.DiskTotal = fs.Blocks * bs
		s.DiskUsed = (fs.Blocks - fs.Bfree) * bs
	}

	// Point-in-time hardware readings (no delta needed).
	s.Temps = gatherTemps()
	s.Batteries = gatherBatteries()
	s.Filesystems = gatherFilesystems()

	// Rate metrics — compare raw counters against the previous sample.
	cur := sample{t: time.Now()}
	cur.cpuBusy, cur.cpuTotal, cur.perBusy, cur.perTotal = readCPU()
	cur.diskRead, cur.diskWrite = readDisk()
	cur.netRx, cur.netTx = readNet()

	mu.Lock()
	if have {
		dt := cur.t.Sub(prev.t).Seconds()
		if dt > 0 {
			if tot := cur.cpuTotal - prev.cpuTotal; tot > 0 {
				s.CPUPct = clamp(float64(cur.cpuBusy-prev.cpuBusy) / float64(tot) * 100)
			}
			s.DiskRead = perSec(cur.diskRead, prev.diskRead, dt)
			s.DiskWrite = perSec(cur.diskWrite, prev.diskWrite, dt)
			s.NetRx = perSec(cur.netRx, prev.netRx, dt)
			s.NetTx = perSec(cur.netTx, prev.netTx, dt)
		}
		if len(cur.perBusy) == len(prev.perBusy) {
			s.PerCPU = make([]float64, len(cur.perBusy))
			for i := range cur.perBusy {
				if tot := cur.perTotal[i] - prev.perTotal[i]; tot > 0 {
					s.PerCPU[i] = clamp(float64(cur.perBusy[i]-prev.perBusy[i]) / float64(tot) * 100)
				}
			}
		}
	}
	prev = cur
	have = true
	mu.Unlock()

	return s
}

func perSec(cur, old uint64, dt float64) float64 {
	if cur < old {
		return 0 // counter reset (reboot / iface flap)
	}
	return float64(cur-old) / dt
}

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// readCPU returns aggregate (busy, total) jiffies plus per-core busy/total
// from /proc/stat ("cpu" line and each "cpuN" line).
func readCPU() (busy, total uint64, perBusy, perTotal []uint64) {
	b, err := os.ReadFile(procRoot + "/stat")
	if err != nil {
		return 0, 0, nil, nil
	}
	line2 := func(fields []string) (bsy, tot uint64) {
		var idle uint64
		for i, v := range fields {
			n, _ := strconv.ParseUint(v, 10, 64)
			tot += n
			if i == 3 || i == 4 { // idle + iowait
				idle += n
			}
		}
		return tot - idle, tot
	}
	for _, line := range strings.Split(string(b), "\n") {
		if !strings.HasPrefix(line, "cpu") {
			continue
		}
		f := strings.Fields(line)
		if len(f) < 5 {
			continue
		}
		if f[0] == "cpu" {
			busy, total = line2(f[1:])
		} else { // cpu0, cpu1, …
			bsy, tot := line2(f[1:])
			perBusy = append(perBusy, bsy)
			perTotal = append(perTotal, tot)
		}
	}
	return busy, total, perBusy, perTotal
}

// gatherTemps reads hardware temperatures from /sys/class/hwmon.
func gatherTemps() []Temp {
	const base = "/sys/class/hwmon"
	dirs, err := os.ReadDir(base)
	if err != nil {
		return nil
	}
	var out []Temp
	seen := map[string]int{}
	for _, d := range dirs {
		hw := base + "/" + d.Name()
		chip := readTrim(hw + "/name")
		files, _ := os.ReadDir(hw)
		for _, f := range files {
			n := f.Name()
			if !strings.HasPrefix(n, "temp") || !strings.HasSuffix(n, "_input") {
				continue
			}
			raw := readTrim(hw + "/" + n)
			milli, err := strconv.ParseFloat(raw, 64)
			if err != nil || milli <= 0 {
				continue
			}
			prefix := strings.TrimSuffix(n, "_input")
			label := readTrim(hw + "/" + prefix + "_label")
			if label == "" {
				label = chip
			} else if chip != "" {
				label = chip + " " + label
			}
			// Ensure labels are unique so they can be toggled individually.
			seen[label]++
			if seen[label] > 1 {
				label = label + " #" + strconv.Itoa(seen[label])
			}
			out = append(out, Temp{Label: label, Celsius: milli / 1000})
			if len(out) >= 32 {
				return out
			}
		}
	}
	return out
}

// gatherBatteries reads power supplies of type Battery/UPS.
func gatherBatteries() []Battery {
	const base = "/sys/class/power_supply"
	dirs, err := os.ReadDir(base)
	if err != nil {
		return nil
	}
	var out []Battery
	for _, d := range dirs {
		ps := base + "/" + d.Name()
		typ := readTrim(ps + "/type")
		if typ != "Battery" && typ != "UPS" {
			continue
		}
		pct, _ := strconv.Atoi(readTrim(ps + "/capacity"))
		out = append(out, Battery{Name: d.Name(), Pct: pct, Status: readTrim(ps + "/status")})
	}
	return out
}

// realFS is the set of on-disk filesystem types worth reporting.
var realFS = map[string]bool{
	"ext2": true, "ext3": true, "ext4": true, "xfs": true, "btrfs": true,
	"zfs": true, "f2fs": true, "vfat": true, "ntfs": true, "ntfs3": true, "exfat": true,
}

// hostRoot, when set (AXBOARD_HOST_ROOT, e.g. /host with `- /:/host:ro` in
// compose), lets the container statfs the host's real filesystems: we read the
// host PID-1 mount table and statfs each mount under that prefix. Without it we
// fall back to the container's own visible mounts.
var hostRoot = os.Getenv("AXBOARD_HOST_ROOT")

// gatherFilesystems statfs's each mounted real filesystem (deduped by device).
func gatherFilesystems() []Filesystem {
	mountsFile := procRoot + "/mounts"
	if hostRoot != "" {
		mountsFile = procRoot + "/1/mounts" // host mount namespace
	}
	b, err := os.ReadFile(mountsFile)
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	var out []Filesystem
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) < 3 || !realFS[f[2]] || seen[f[0]] {
			continue
		}
		statPath := f[1]
		if hostRoot != "" {
			statPath = hostRoot + f[1]
		}
		var fs syscall.Statfs_t
		if err := syscall.Statfs(statPath, &fs); err != nil {
			continue
		}
		bs := uint64(fs.Bsize)
		total := fs.Blocks * bs
		if total == 0 {
			continue
		}
		seen[f[0]] = true
		out = append(out, Filesystem{Path: f[1], Total: total, Used: (fs.Blocks - fs.Bfree) * bs})
		if len(out) >= 12 {
			break
		}
	}
	return out
}

func readTrim(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// ---- top processes -------------------------------------------------------

type procSample struct {
	jiffies uint64
	rss     uint64
	name    string
}

var (
	procMu   sync.Mutex
	procPrev map[int]procSample
	procT    time.Time
)

// TopProcs returns the n processes using the most CPU since the previous call.
// Needs the host PID namespace (compose `pid: host`) to see host processes;
// otherwise it only sees axboard's own process.
func TopProcs(n int) []Proc {
	dirs, err := os.ReadDir(procRoot)
	if err != nil {
		return nil
	}
	pageSize := uint64(syscall.Getpagesize())
	now := time.Now()
	cur := make(map[int]procSample, len(dirs))
	for _, d := range dirs {
		pid, err := strconv.Atoi(d.Name())
		if err != nil {
			continue
		}
		b, err := os.ReadFile(procRoot + "/" + d.Name() + "/stat")
		if err != nil {
			continue
		}
		s := string(b)
		// comm is field 2, wrapped in parens and may contain spaces/parens.
		op := strings.IndexByte(s, '(')
		cl := strings.LastIndexByte(s, ')')
		if op < 0 || cl < 0 || cl < op {
			continue
		}
		name := s[op+1 : cl]
		rest := strings.Fields(s[cl+1:]) // starts at field 3 (state)
		if len(rest) < 22 {
			continue
		}
		utime, _ := strconv.ParseUint(rest[11], 10, 64) // field 14
		stime, _ := strconv.ParseUint(rest[12], 10, 64) // field 15
		rssPages, _ := strconv.ParseUint(rest[21], 10, 64) // field 24
		cur[pid] = procSample{jiffies: utime + stime, rss: rssPages * pageSize, name: name}
	}

	procMu.Lock()
	prev := procPrev
	dt := now.Sub(procT).Seconds()
	procPrev = cur
	procT = now
	procMu.Unlock()

	clkTck := 100.0 // USER_HZ; effectively always 100 on Linux
	var out []Proc
	for pid, c := range cur {
		var cpu float64
		if prev != nil && dt > 0 {
			if p, ok := prev[pid]; ok && c.jiffies >= p.jiffies {
				cpu = float64(c.jiffies-p.jiffies) / clkTck / dt * 100
			}
		}
		out = append(out, Proc{PID: pid, Name: c.name, CPU: cpu, RSS: c.rss})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CPU != out[j].CPU {
			return out[i].CPU > out[j].CPU
		}
		return out[i].RSS > out[j].RSS
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// readDisk sums bytes read/written across whole block devices.
func readDisk() (read, write uint64) {
	b, err := os.ReadFile(procRoot + "/diskstats")
	if err != nil {
		return 0, 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) < 10 {
			continue
		}
		if !wholeDisk.MatchString(f[2]) {
			continue
		}
		rd, _ := strconv.ParseUint(f[5], 10, 64) // sectors read
		wr, _ := strconv.ParseUint(f[9], 10, 64) // sectors written
		read += rd * 512
		write += wr * 512
	}
	return read, write
}

// readNet sums rx/tx bytes across non-loopback interfaces.
func readNet() (rx, tx uint64) {
	b, err := os.ReadFile(procRoot + "/net/dev")
	if err != nil {
		return 0, 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		i := strings.IndexByte(line, ':')
		if i < 0 {
			continue
		}
		name := strings.TrimSpace(line[:i])
		if !physicalNet.MatchString(name) {
			continue
		}
		f := strings.Fields(line[i+1:])
		if len(f) < 9 {
			continue
		}
		r, _ := strconv.ParseUint(f[0], 10, 64) // rx bytes
		t, _ := strconv.ParseUint(f[8], 10, 64) // tx bytes
		rx += r
		tx += t
	}
	return rx, tx
}
