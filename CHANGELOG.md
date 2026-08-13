# Changelog

All notable changes to axboard are documented here. Versions follow
[semantic versioning](https://semver.org/).

## v0.2.0

First public release — a single Go binary with an embedded React SPA, configured
by hand-editable YAML, deployed as a multi-arch (amd64 / arm64) container image.

### Widgets
- **80+ widgets across six categories** (Productivity, System, Services, Home
  Assistant, Network, External).
- **Home Assistant suite** — lights, fans, covers, climate, scenes, sensors,
  power, presence, locks, media, vacuum, with a shared connection.
- **Service panels** — Proxmox, Sonarr/Radarr, Jellyfin/Plex, Overseerr,
  Transmission, qBittorrent, Immich, Nextcloud, Paperless-ngx, Portainer,
  Scrutiny, Prometheus, Traefik, Tailscale, UniFi, PBS, notifications, and more.
- **Content feeds** — Reddit, Hacker News, Lobsters, YouTube, RSS, releases,
  markets, weather, sun, plus a custom-API and JS-template builder.
- **System** — host stats, resource gauges, per-core CPU, temperatures, disks,
  network graph, containers, battery.
- Uptime monitor with an Uptime-Kuma-style heartbeat; iOS-style Sun widget.

### Dashboards & theming
- Multiple dashboards, each addressable by URL and keeping **its own theme**,
  accent, background and density.
- 13 built-in themes plus a custom-theme creator, glass styling, custom CSS.

### Monitoring
- HTTP / TCP / ping / DNS health checks + push heartbeats, 24h/7d/30d uptime,
  retries and cert-expiry warnings.
- Alerts (ntfy / Telegram / email / webhook) and server-rendered, themeable
  public status pages with criticality-aware severity.

### Platform
- Point-and-click configuration for everything — no config files required
  (YAML optional, hot-reloaded).
- Optional built-in argon2id login; open/LAN-bound by default.
- ⌘K command palette, keyboard shortcuts, installable PWA.
- Published to `ghcr.io/axel-labs-cloud/axboard` (`:v0.2.0`, `:latest`).

## v0.1.0
- Initial internal scaffold.
