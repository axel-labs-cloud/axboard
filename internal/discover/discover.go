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
	Names  []string          `json:"Names"`
	Labels map[string]string `json:"Labels"`
	State  string            `json:"State"`
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
