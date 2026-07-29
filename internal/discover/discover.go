// Package discover surfaces candidate services from a Docker/Podman socket so
// the UI can offer to add them. It reads container labels — an explicit
// axboard.url, or a Traefik Host() router rule — and never derives from raw
// published ports (the host address is unknowable from inside a container).
package discover

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Service is a discovered candidate the user can add as an app.
type Service struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Icon   string `json:"icon,omitempty"`
	Group  string `json:"group,omitempty"`
	Source string `json:"source"`
}

type dockerContainer struct {
	ID     string            `json:"Id"`
	Names  []string          `json:"Names"`
	Labels map[string]string `json:"Labels"`
	Image  string            `json:"Image"`
	State  string            `json:"State"`
	Status string            `json:"Status"`
}

// Container is a running/stopped container surfaced by the container-status
// widget. CPU/Mem are only populated when stats are requested (running only).
type Container struct {
	Name     string  `json:"name"`
	Image    string  `json:"image"`
	State    string  `json:"state"`  // running, exited, created, paused…
	Status   string  `json:"status"` // human string, e.g. "Up 2 hours"
	CPU      float64 `json:"cpu,omitempty"`      // percent of a single core span
	Mem      uint64  `json:"mem,omitempty"`      // bytes in use
	MemLimit uint64  `json:"memLimit,omitempty"` // bytes limit
}

// Containers lists all containers (running + stopped) over the socket. When
// withStats is set, CPU% + memory are fetched (concurrently) for running ones.
func Containers(ctx context.Context, socketPath string, withStats bool) ([]Container, error) {
	var raw []dockerContainer
	if err := getJSON(ctx, socketPath, "http://d/v1.41/containers/json?all=1", &raw); err != nil {
		return nil, err
	}
	out := make([]Container, len(raw))
	for i, c := range raw {
		name := "unknown"
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		out[i] = Container{Name: name, Image: c.Image, State: c.State, Status: c.Status}
	}
	if !withStats {
		return out, nil
	}
	// Fetch stats for running containers, bounded concurrency.
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for i, c := range raw {
		if c.State != "running" || c.ID == "" {
			continue
		}
		wg.Add(1)
		go func(i int, id string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			if cpu, mem, lim, err := containerStats(ctx, socketPath, id); err == nil {
				out[i].CPU = cpu
				out[i].Mem = mem
				out[i].MemLimit = lim
			}
		}(i, c.ID)
	}
	wg.Wait()
	return out, nil
}

type dockerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage  uint64   `json:"total_usage"`
			PercpuUsage []uint64 `json:"percpu_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs  uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
}

// containerStats returns CPU% (of one core), memory in use and the memory limit
// from a one-shot stats sample (the Docker/Podman API fills precpu for the delta).
func containerStats(ctx context.Context, socketPath, id string) (float64, uint64, uint64, error) {
	var s dockerStats
	if err := getJSON(ctx, socketPath, "http://d/v1.41/containers/"+id+"/stats?stream=false", &s); err != nil {
		return 0, 0, 0, err
	}
	cpu := 0.0
	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage) - float64(s.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(s.CPUStats.SystemUsage) - float64(s.PreCPUStats.SystemUsage)
	ncpu := float64(s.CPUStats.OnlineCPUs)
	if ncpu == 0 {
		ncpu = float64(len(s.CPUStats.CPUUsage.PercpuUsage))
	}
	if ncpu == 0 {
		ncpu = 1
	}
	if sysDelta > 0 && cpuDelta > 0 {
		cpu = (cpuDelta / sysDelta) * ncpu * 100
	}
	// Subtract page cache from usage when the kernel reports it (matches `docker stats`).
	mem := s.MemoryStats.Usage
	if cache, ok := s.MemoryStats.Stats["inactive_file"]; ok && cache <= mem {
		mem -= cache
	} else if cache, ok := s.MemoryStats.Stats["cache"]; ok && cache <= mem {
		mem -= cache
	}
	return cpu, mem, s.MemoryStats.Limit, nil
}

func getJSON(ctx context.Context, socketPath, url string, dst any) error {
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socketPath)
			},
		},
	}
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("querying docker socket %s: %w", socketPath, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("docker socket returned %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(dst)
}

// Host(`foo.example.com`) or Host("foo.example.com") in a Traefik rule.
var traefikHostRe = regexp.MustCompile("Host\\(([`\"])([^`\"]+)[`\"]\\)")

// FromDockerSocket queries the Docker/Podman API over the unix socket and
// returns candidate services derived from container labels.
func FromDockerSocket(ctx context.Context, socketPath string) ([]Service, error) {
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				var d net.Dialer
				return d.DialContext(ctx, "unix", socketPath)
			},
		},
	}
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	// The dummy host is ignored — the transport always dials the socket.
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, "http://d/v1.41/containers/json", nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("querying docker socket %s: %w", socketPath, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker socket returned %d", resp.StatusCode)
	}

	var containers []dockerContainer
	if err := json.NewDecoder(resp.Body).Decode(&containers); err != nil {
		return nil, err
	}

	out := make([]Service, 0, len(containers))
	for _, c := range containers {
		name := containerName(c)
		url := deriveURL(c.Labels)
		if url == "" {
			continue // only surface containers with a resolvable URL
		}
		out = append(out, Service{
			Name:   labelOr(c.Labels, "axboard.name", name),
			URL:    url,
			Icon:   c.Labels["axboard.icon"],
			Group:  c.Labels["axboard.group"],
			Source: "docker",
		})
	}
	return out, nil
}

func containerName(c dockerContainer) string {
	if len(c.Names) > 0 {
		return strings.TrimPrefix(c.Names[0], "/")
	}
	return "unknown"
}

func labelOr(labels map[string]string, key, fallback string) string {
	if v := labels[key]; v != "" {
		return v
	}
	return fallback
}

func deriveURL(labels map[string]string) string {
	// 1. Explicit override.
	if u := labels["axboard.url"]; u != "" {
		return u
	}
	// 2. Any Traefik router Host() rule.
	for k, v := range labels {
		if strings.HasPrefix(k, "traefik.http.routers.") && strings.HasSuffix(k, ".rule") {
			if m := traefikHostRe.FindStringSubmatch(v); m != nil {
				return "https://" + m[2]
			}
		}
	}
	return ""
}
