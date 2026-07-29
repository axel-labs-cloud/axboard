<div align="center">

# axboard

**A fast, self-hosted dashboard for your homelab — the front door to every service you run.**

Drag-and-drop widgets, health-checked app cards, a command palette, live charts, and deep theming — all from a single Go binary with an embedded React app and a hand-editable YAML config. No database, no accounts, no build step to configure.

</div>

<!-- Replace with a real screenshot / GIF before publishing -->
<div align="center">
  <em>📸 Screenshot goes here — a themed board with the apps grid, weather, markets chart and the ⌘K palette.</em>
</div>

---

## Why axboard

- **One binary.** Go server + embedded SPA. Drop it on a box, point it at a YAML file, done.
- **YAML you actually own.** Your config is a human file the server only reads. Layouts and machine state live separately, so dragging widgets never touches your comments.
- **Live, not static.** Health checks (HTTP/TCP/ping/DNS + push heartbeats) with 24h/7d/30d uptime, container states, host stats, weather, crypto/stock charts, RSS, release-watch — all refreshing on their own.
- **Alerts & status pages.** Down/recover notifications (ntfy/Telegram/email/webhook) and public, themeable status pages with criticality-aware severity — optionally gated behind a built-in login.
- **Genuinely themeable.** 13 built-in themes (including a neon **Cyber**), a custom-theme creator, per-dashboard backgrounds (color/gradient/image), glassmorphism widget styling, fonts, and a custom-CSS escape hatch.
- **Keyboard-first.** ⌘K command palette (apps, bookmarks, commands, web search with bangs) and a `?` shortcut cheat sheet.
- **Installable PWA.** Add it to your phone/desktop; the shell loads instantly and works offline.

## Quick start

### Podman / Docker Compose (recommended)

```sh
git clone <this repo> axboard && cd axboard
mkdir -p config && cp config.example.yaml config/config.yaml
podman compose up -d      # or: docker compose up -d
```

Open **http://localhost:8080**. Edit `config/config.yaml` in your editor — the server hot-reloads on save. The bundled [`config.example.yaml`](./config.example.yaml) is a full, working starter (services, groups, a global top bar, and two themed dashboards).

> The compose file mounts a read-only Podman socket for **auto-discovery** (it suggests services from running containers) and adds `NET_RAW` for ICMP health checks. Both are optional — comment them out if you don't want them.
>
> It also runs with **`network_mode: host`** so the **Host stats**, **Resource gauge**, and **Network graph** widgets can read real host **network I/O** (`/proc/net/dev` is per-network-namespace — under bridged networking the container only sees its own interface). With host networking the container binds the host port directly, so there is no `ports:` mapping. Drop `network_mode: host` to go back to bridged networking; CPU / memory / disk still report the host, but network I/O will show only the container's own traffic. **Wake-on-LAN** also needs host networking to reach the LAN broadcast.
>
> Two more optional grants power the deeper system widgets: **`pid: host`** lets **Top processes** see host processes (without it, only axboard's own), and a read-only **`/:/host:ro`** bind + `AXBOARD_HOST_ROOT=/host` lets **Filesystems** `statfs` the host's real mounts. Both are commented as removable in `compose.yaml` — drop them if you'd rather not expose host processes / files to the container.

### Single binary

```sh
make build                                   # needs Go 1.26 + Node 22
cp config.example.yaml config.yaml
./bin/axboard --config ./config.yaml --state ./state.yaml --addr :8080
```

## Configuration

Two files, one clear split:

| File | Owner | Holds |
| --- | --- | --- |
| `config.yaml` | **You** (hand-edited) | Apps, groups, dashboards, widgets, the global top bar. Server only reads it; hot-reloads on change. |
| `state.yaml` | **axboard** (machine-managed) | Grid layouts (x/y/w/h per widget). Written on every drag — never edit by hand. |

On a YAML parse error the UI shows a banner pointing at the line and keeps serving the last-good config — it never crashes on a bad save. Themes and widget-style settings are browser-local (localStorage).

A minimal app + dashboard:

```yaml
apps:
  - id: jellyfin
    name: Jellyfin
    url: https://jellyfin.lan
    icon: jellyfin                # simple-icons / selfh.st slug, URL, or initials
    group: media
    health: { type: http, url: https://jellyfin.lan/health, interval: 60s }

groups:
  - { id: media, name: Media, color: "#8b5cf6" }

dashboards:
  - id: home
    name: Home
    default: true
    accent: "#22d3ee"
    background: { type: gradient, gradient: "linear-gradient(135deg,#0f172a,#0e7490)" }
    widgets:
      - { id: clock-1, type: clock, title: Clock }
      - { id: apps-1,  type: apps,  title: Media, config: { groups: [media] } }
      - { id: wx-1,    type: weather, title: Weather, config: { city: Barcelona, lat: 41.39, lon: 2.16, hourly: true } }
```

Each check polls on its own `health.interval`. Set a fleet-wide default with
`server.default_interval` (applied to any check that omits its own); it falls
back to 60s when unset. Check types: **http**, **tcp**, **ping**, **dns**, and
**push** — a passive heartbeat monitor where the job pings
`/api/push/<id>` and axboard marks it down if a beat is missed. Mark a service
`critical: true` so its outage is treated as a major incident on status pages.

See [`config.example.yaml`](./config.example.yaml) for the complete schema, including all health-check options, the global `topBar`, and per-dashboard backgrounds.

## Widgets

Add widgets from the **⋯ menu → Add widget** (filterable by category and searchable).

| Category | Widgets |
| --- | --- |
| **System** | Clock (with extra timezones) |
| **Infrastructure** | Apps grid · Single app tile · Status summary · Host stats · Resource gauge (CPU/RAM/disk · ring/arc/bar/spark) · Per-core CPU · Temperatures · Top processes · Filesystems · Network graph · Battery / UPS · Speed test (Cloudflare) · Camera (Frigate / MJPEG) · Grafana panel · Wake-on-LAN · Containers (Docker/Podman) · Uptime monitor · Public IP / VPN · Custom API (any JSON endpoint) · axdnsd · axlbd |
| **Productivity** | Bookmarks · Search · Checklist · Notes · Countdown · Pomodoro · Image · Section label |
| **External** | Weather (hourly + forecast) · Sun (sunrise/sunset/UV) · Markets (crypto + stocks, live charts) · Releases (GitHub/GitLab) · Calendar (iCal) · RSS/Atom · Embed (iframe) · Concentus (now-playing) |

Widgets are **size-responsive** — most re-layout as you resize them (e.g. Weather goes compact → detailed → forecast; Markets grows from a price list into per-symbol line charts).

## Appearance & themes

Everything lives in **⋯ → Themes & appearance…** (a live-preview drawer):

- **Per-dashboard:** accent color (swatches or picker) and background — solid color, gradient (curated presets or custom CSS), or image (upload or URL) with blur, dim, fit and opacity.
- **Global top bar:** style (default / solid / contrast / transparent) + **flush** edge-to-edge mode, branding (hide/replace the logo, rename or hide the name), search-bar toggle, header widgets (clock, weather, services-up), and icon-only bookmark launchers.
- **Themes tab:** 13 built-ins, a **custom-theme creator** (per-token color pickers, import/export as JSON), a **font** picker, **widget style** (opacity / backdrop-blur / corner radius / border), and a **custom-CSS** box.

## Multiple dashboards & deep links

Tabs across the top switch between dashboards. Each is **addressable by URL**: the
default dashboard lives at `/`, and every other one at `/<slug>` derived from its
name — so a dashboard named **Dev** opens directly at **`/dev`**. Typing the path
(or bookmarking it) opens that dashboard; switching tabs updates the URL, and
browser back/forward work. Slugs lowercase the name and turn spaces into dashes
(`Home Lab` → `/home-lab`).

## Keyboard shortcuts

Press **`?`** in-app for the full cheat sheet.

| Key | Action |
| --- | --- |
| `⌘/Ctrl + K` | Command palette — apps, bookmarks, commands, web search (bangs: `g …`, `!yt …`, `gh …`) |
| `⌘/Ctrl + E` | Toggle edit mode |
| `⌘/Ctrl + Z` / `⇧Z` | Undo / redo |
| `⌘/Ctrl + 1…9` | Jump to dashboard N |
| `Del` / `⌫` | Remove selected widget (edit mode) |
| Arrow keys | Nudge selected widget (edit mode) |

## Alerts

axboard notifies you when a health-checked app **goes down or recovers**.
Configure it entirely from the UI — **⋯ menu → Configure → Alerts** — with a
per-channel **Save & test** button to confirm each one works (or hand-edit the
`alerts` block in `config.yaml`). Every configured channel fires (all
best-effort):

- **ntfy** — zero infra: POSTs to a topic on `ntfy.sh` or your self-hosted ntfy.
- **Telegram** — a bot token (from `@BotFather`) + your chat id.
- **Email** — through your SMTP relay (host + creds).
- **Webhook** — a plain JSON POST for Discord/Slack/custom.

**Retries** (per service) tolerate N failed checks before "down" so a blip
doesn't false-alarm; a **resend interval** re-notifies while a service stays
down; you can **mute** noisy services or **pause** all alerts for a maintenance
window. **Certificate expiry** is checked on every HTTPS service and alerts
before it lapses. See the commented `alerts:` example in
[`config.example.yaml`](./config.example.yaml).

## Status pages

Server-rendered status pages that need no JS — the default at **`/status`** and
any number of named pages at **`/status/<slug>`**. Each groups the chosen
services with a status dot, a Uptime-Kuma-style history strip, **24h/7d/30d
uptime**, response time, and cert-expiry warnings, plus an embeddable SVG badge
at `/status/badge/<id>`.

Build them from the UI — **⋯ menu → Configure → Status pages** — with a live
preview. Per page you can set:

- **Identity** — title (with its own colour), slug, header/footer text, and hide
  the "Powered by axboard" branding.
- **Summary banner** — a plain-language headline coloured by severity, in one of
  five styles (tint / minimal / strip / outline / solid).
- **Severity by criticality** — a **critical** service down turns the banner
  **red**; non-critical outages go **amber** and escalate to red once a
  configurable number of them are down at once (the "red at N" threshold).
- **Appearance** — dark/light theme, width (narrow/wide/full), and a backdrop
  (colour / gradient / image with blur & dim).
- **Content** — include whole groups and/or pick individual services.
- **Notices** — manual info / warning / critical / maintenance banners for
  incidents and scheduled work.

When [authentication](#authentication) is enabled, status pages are **gated
behind a login by default**. Tick **Public (no login)** on a page (`public:
true`) to serve it without a session — so you can share a public status page
while the dashboard stays private. With auth off, all pages are public.

## Authentication

axboard is **open by default** — LAN-bound, no login, meant to sit behind a
reverse proxy. There is an **optional, opt-in** built-in login for when a proxy
isn't in the picture. It stays off until you add a user.

**Enable it:**

1. Generate a password hash (argon2id). Run the `passwd` helper — interactively
   (prompts, no echo) or piped:

   ```sh
   # against the running container
   podman exec -it axboard /usr/local/bin/axboard passwd axel
   # or, piping the password in
   echo -n 'your-password' | ./axboard passwd axel
   ```

2. Paste the printed snippet into `config.yaml` (it's hot-reloaded, no restart):

   ```yaml
   server:
     bind: 0.0.0.0:8080
     auth:
       session_ttl: 168h        # optional, default 7d
       users:
         - username: axel
           password_hash: "$argon2id$v=19$m=65536,t=3,p=4$…"
   ```

With one or more users configured, the SPA shows a login screen and the whole
`/api` surface requires a signed-cookie session — **except** heartbeat ingest
(`/api/push/*`), `/healthz`, and `/metrics`, which stay open for external jobs
and monitoring. **Log out** lives in the ⋯ dashboard menu.

Credentials are never editable through the UI's structured save path and hashes
are never sent to the browser — manage users by editing `config.yaml` (or the
in-app raw-YAML editor) plus `axboard passwd`. The session-signing secret is
auto-generated into `session.key` beside `state.yaml`; deleting it (or rotating
it) logs everyone out.

> Built-in login is a lightweight fallback, not an IdP. For WAN exposure, prefer
> a reverse proxy with forward-auth (Authentik, Authelia, oauth2-proxy). Either
> way, bind `server.bind` to a LAN address.

## Deployment & security

CI publishes a **multi-arch (amd64/arm64)** image to the project's container registry; `v*` tags cut a GitLab Release. Pin `:latest`, a branch tag, or a specific `:v1.2.3` in your deployment.

## Development

```sh
make dev-go     # Go API on :8080
make dev-web    # Vite dev server on :5173, proxies /api/* → :8080 (HMR)
```

`make build` bundles the SPA into `web/dist` (embedded via `//go:embed`) and compiles the binary. `go test ./...` runs the suite.

## Tech stack

Go 1.26 · chi · `gopkg.in/yaml.v3` · fsnotify — React 19 · Vite · TypeScript · Tailwind 4 · TanStack Query · react-grid-layout. No codegen; a small hand-written fetch client talks to a small HTTP API.

## What axboard is *not*

Not a plugin platform, not a metrics collector (health checks are liveness only — point at Grafana for real observability), and not multi-tenant. Keeping it small is the point. See [CLAUDE.md](./CLAUDE.md) for the full design rationale.

## License

MIT.
