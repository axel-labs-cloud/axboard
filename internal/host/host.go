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

	// Rate metrics — compare raw counters against the previous sample.
	cur := sample{t: time.Now()}
	cur.cpuBusy, cur.cpuTotal = readCPU()
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

// readCPU returns (busy, total) jiffies from the aggregate "cpu" line.
func readCPU() (busy, total uint64) {
	b, err := os.ReadFile(procRoot + "/stat")
	if err != nil {
		return 0, 0
	}
	for _, line := range strings.Split(string(b), "\n") {
		if !strings.HasPrefix(line, "cpu ") {
			continue
		}
		f := strings.Fields(line)[1:] // user nice system idle iowait irq softirq steal ...
		var idle uint64
		for i, v := range f {
			n, _ := strconv.ParseUint(v, 10, 64)
			total += n
			if i == 3 || i == 4 { // idle + iowait
				idle += n
			}
		}
		busy = total - idle
		return busy, total
	}
	return 0, 0
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
