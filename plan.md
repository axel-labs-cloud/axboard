# axboard — implementation plan

Active checklist. Tick boxes as work lands. Granularity is commit-level — one box ≈ one focused commit or a small cluster of related edits. See [CLAUDE.md](./CLAUDE.md) for stack, persistence model, and rationale.

**Iteration rule** (per `feedback_dev_workflow_local_iterate.md`): finish each section locally, verify against its own checks, push when the section is green. Don't push half-finished phases.

---

## Phase 2 — Project skeleton

- [ ] `go.mod` — `module gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard`, Go 1.26
- [ ] `cmd/axboard/main.go` — minimal `package main` with placeholder server (just `/healthz` → "ok")
- [ ] `internal/` packages stubbed (each with a `doc.go` so the package isn't empty)
- [ ] `web/` Vite scaffold: `npm create vite@latest -- --template react-ts`, then add Tailwind 4 (`@tailwindcss/vite`), `@tanstack/react-query`, `react-router-dom`, `react-grid-layout`, `@headlessui/react`, `simple-icons`
- [ ] `web/vite.config.ts` — proxy `/api/*` and `/healthz` to `localhost:8080` for dev
- [ ] `Makefile` — `dev`, `build`, `container`, `clean` targets
- [ ] `.gitignore` — `config.yaml`, `state.yaml`, `web/dist/`, `bin/`, `node_modules/`
- [ ] `config.example.yaml` — fully-worked example with comments
- [ ] `Containerfile` — multi-stage (node-build → go-build → distroless final)
- [ ] `README.md` — replace GitLab boilerplate; one-paragraph what-and-why, install snippet
- [ ] Verify: `make dev` starts both servers, `curl :8080/healthz` returns "ok", Vite renders default React page on `:5173`

---

## Phase 3 — Lift the widget framework from a1-v2

### 3.1 Drop-in copy (no edits)

Copy these directly from `/home/axel/Code/projects/a1-v2/web/src/features/dashboard/`:

- [ ] `gridUtils.ts`
- [ ] `useDashboardHistory.ts`
- [ ] `useDashboardShortcuts.ts`
- [ ] `useLongPress.ts`
- [ ] `layoutMigrations.ts`
- [ ] `timezones.ts`
- [ ] `ConfigPanelHost.tsx`
- [ ] `WidgetContextMenu.tsx`
- [ ] `SimpleIcon.tsx`
- [ ] `templates/` (whole dir)
- [ ] `TemplatePickerModal.tsx`
- [ ] `widgets/clock/` (whole dir)
- [ ] `widgets/shortcut/` (whole dir)
- [ ] `widgets/checklist/` (whole dir)

### 3.2 Surgery on lifted files

- [ ] `DashboardPage.tsx` — strip `localStorage.getItem("access_token")` and every `Authorization: Bearer` header
- [ ] `DashboardPage.tsx` — repoint layout fetch/persist from `/api/v1/dashboard/dashboards/{id}` to `/api/state`
- [ ] `DashboardPage.tsx` — repoint config-source endpoints to `/api/config`
- [ ] `DashboardPage.tsx` — remove Stats / Nodes / Services entries from the add-widget picker
- [ ] `useDashboards.ts` — collapse to a read-only hook over `/api/config` (no create/delete/rename mutations)
- [ ] `widgets/types.ts` — trim `WidgetType` union to `clock | shortcut | checklist | apps`; remove unused config interfaces; add `AppsConfig`
- [ ] `widgets/registry.ts` — register `apps`, drop the removed types
- [ ] `dashboardIO.ts` — rename serialized format tag `a1dash` → `axboard`

### 3.3 Frontend plumbing

- [ ] `web/src/api/client.ts` — thin `fetch` wrapper, typed for the six endpoints in CLAUDE.md
- [ ] `web/src/api/types.ts` — TS types that mirror the YAML schema (App, Group, Dashboard, Widget, AppStatus)
- [ ] `web/src/App.tsx` — single route renders `DashboardPage`; `QueryClientProvider` at root
- [ ] `web/src/hooks/useSSE.ts` — subscribe to `/api/events`, invalidate `["config"]` on `config_changed`, surface `config_error` payload

### 3.4 Verify Phase 3

- [ ] `npm run build` succeeds with zero TS errors
- [ ] Vite dev server renders the dashboard page (even with no backend data; expect graceful empty state)
- [ ] No references to `cmdb`, `iam`, `jwt`, or `Authorization` remain in `web/src/`

---

## Phase 4 — Backend

### 4.1 Config loader

- [ ] `internal/config/types.go` — Go structs mirroring `config.yaml` (Server, App, Group, Dashboard, Widget). Use `yaml:"..."` tags.
- [ ] `internal/config/loader.go` — `Load(path string) (*Config, error)` with validation (unique app IDs, group references resolve, health type ∈ {http,tcp,none})
- [ ] `internal/config/watcher.go` — fsnotify watcher, 250 ms debounce, callback-based; surfaces parse errors without crashing
- [ ] `internal/config/writer.go` — `Save(path string, cfg *Config) error` using `yaml.v3` Encoder; called only from the explicit UI-edit path
- [ ] Unit tests for loader (good config, missing fields, unknown health type, duplicate IDs)

### 4.2 State store

- [ ] `internal/state/types.go` — `State` struct (per-dashboard layouts keyed by widget ID, last-active dashboard)
- [ ] `internal/state/store.go` — `Load`, `Save` with file lock (`flock`) and atomic rename (write to `state.yaml.tmp`, then `os.Rename`)
- [ ] Header comment `# managed by axboard — do not edit` written on every save
- [ ] Test: concurrent Save calls don't corrupt the file

### 4.3 Health checker

- [ ] `internal/health/types.go` — `Status` enum (`unknown`, `healthy`, `degraded`, `down`), `Result` struct (status, last-checked, response-ms, error)
- [ ] `internal/health/http.go` — HTTP check (GET with timeout, compare status code)
- [ ] `internal/health/tcp.go` — TCP check (`net.DialTimeout`)
- [ ] `internal/health/pool.go` — `Pool` with `Reconcile(apps []App)` method (diff IDs, spawn/cancel goroutines), `Get(id string) Result`, `Force(id string)` for immediate re-check
- [ ] On reconcile: existing apps keep their last status; cancelled apps' status is purged
- [ ] Unit test: pool reconciles a config change without resetting unchanged apps

### 4.4 Icon resolver

- [ ] `internal/icons/resolver.go` — server-side resolver is light: accept a slug, return a stable URL or "use client fallback"
- [ ] (Most icon logic lives client-side in `web/src/features/dashboard/widgets/apps/iconResolver.ts`)

### 4.5 HTTP API

- [ ] `internal/api/router.go` — chi router, mount routes, register middlewares (recoverer, logger, JSON content-type for `/api/*`)
- [ ] `internal/api/config.go` — `GET /api/config`, `PUT /api/config`
- [ ] `internal/api/state.go` — `GET /api/state`, `PUT /api/state`
- [ ] `internal/api/apps.go` — `GET /api/apps/status`, `POST /api/apps/{id}/check`
- [ ] `internal/api/events.go` — SSE handler with channel-based broadcaster; subscribers added/removed safely
- [ ] `internal/api/healthz.go` — `GET /healthz`
- [ ] `internal/web/embed.go` — `//go:embed all:dist` + SPA fallback (lift pattern from [a1-v2/internal/api/spa.go](/home/axel/Code/projects/a1-v2/internal/api/spa.go))
- [ ] `cmd/axboard/main.go` — wire everything: load config → start watcher → start health pool → start server → graceful shutdown on SIGTERM

### 4.6 Verify Phase 4

- [ ] Boot with a hand-crafted `config.yaml` (3 apps in 2 groups, 1 dashboard with `apps` widget)
- [ ] `curl :8080/api/config` returns the parsed config
- [ ] `curl :8080/api/apps/status` returns a map keyed by app ID
- [ ] `touch config.yaml` triggers an SSE event within ~500 ms (`curl -N :8080/api/events`)
- [ ] Save broken YAML → server stays up, `/api/events` emits `config_error`, `/api/config` still returns the last-good config

---

## Phase 5 — Apps widget

- [ ] `web/src/features/dashboard/widgets/apps/iconResolver.ts` — fallback chain: simple-icons → dashboard-icons CDN URL → custom URL → initials chip (deterministic color from hash of name)
- [ ] `web/src/features/dashboard/widgets/apps/AppCard.tsx` — card layout for one app; props include density mode
- [ ] `web/src/features/dashboard/widgets/apps/StatusDot.tsx` — colored dot + tooltip (last-checked, response time). Colors only, no emoji.
- [ ] `web/src/features/dashboard/widgets/apps/GroupHeader.tsx` — collapsible section header with group color accent
- [ ] `web/src/features/dashboard/widgets/apps/index.tsx` — widget component: reads apps from config, filters by `config.groups`, renders grouped cards with current density
- [ ] `web/src/features/dashboard/widgets/apps/ConfigPanel.tsx` — group multi-select + density radio
- [ ] Register `apps` in `widgets/registry.ts`
- [ ] Status polling via TanStack Query, `refetchInterval: 15_000`

### 5.1 Verify Phase 5

- [ ] Configure 10 apps across 3 groups in `config.yaml`
- [ ] All 4 icon-resolver branches exercised (simple-icons, dashboard-icons, custom URL, initials)
- [ ] Density toggle through ConfigPanel reflects immediately in the UI; choice persists in `state.yaml`
- [ ] Block one app at the firewall (`iptables -A OUTPUT -d <ip> -j DROP`) — status flips red within one interval
- [ ] `curl -X POST :8080/api/apps/sonarr/check` — `/api/apps/status` reflects the new status on next poll
- [ ] Click app card opens URL in a new tab

---

## Phase 6 — End-to-end verification

- [ ] **YAML round-trip 1**: hand-author `config.yaml` with comments, blank lines, deliberate app ordering. Boot, `curl /api/config`, confirm parse matches file
- [ ] **YAML round-trip 2**: drag a widget in the UI. `sha256sum config.yaml` before and after = identical. `state.yaml` reflects the move.
- [ ] **YAML round-trip 3**: use UI "add app" flow. Confirm warning shown, `config.yaml` rewritten, comments lost (this is the documented contract)
- [ ] **Hot reload**: `echo "" >> config.yaml` — UI updates without page reload within ~500 ms
- [ ] **Bad YAML safety**: save syntactically broken YAML — server keeps serving last-good config, UI shows parse-error banner with line/column
- [ ] **Drag-and-drop framework regression**: drag → position persisted on drag-stop. Resize → size persisted on resize-stop. Undo/redo keyboard shortcut works
- [ ] **Multi-dashboard**: with 2 dashboards in YAML, the tab bar switches between them; correct layout loads per tab
- [ ] **Single binary**: `make build` → ~20 MB. `./bin/axboard --config /tmp/test/config.yaml` from a clean tmpdir, no external deps
- [ ] **Container**: `podman build`, run with `-v ./config.yaml:/etc/axboard/config.yaml`, hit from a phone on the same wifi

---

## Out of scope for v1 (named explicitly so they don't sneak in)

- JSON-path / keyword body checks
- ICMP ping
- Inline UI add/edit of apps as the default flow (YAML is the model; UI edit exists but warns)
- Drag-to-reorder *within* the apps widget
- Live service integrations (Portainer / Sonarr / Proxmox / Plex metrics on cards)
- Any kind of auth
- Multi-user
- Search-as-you-type, tags, nested groups

If any of these become must-haves, they land as v2 with their own plan file.
