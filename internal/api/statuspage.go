package api

import (
	"html/template"
	"net/http"
	"sort"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/health"
)

// ---------------------------------------------------------------------------
// Public status page — a lightweight, server-rendered, auth-free /status page
// (Uptime-Kuma-style). Shows every health-checked service grouped, with a
// status pill, recent uptime %, response time, and cert-expiry warnings.
// No JS beyond a meta-refresh; works even with scripting disabled.
// ---------------------------------------------------------------------------

type spService struct {
	Name       string
	Status     string
	StatusText string
	UptimePct  int
	HasUptime  bool
	ResponseMS int64
	CertDays   int
	HasCert    bool
}

type spGroup struct {
	Name     string
	Services []spService
}

type spData struct {
	Title     string
	Up        int
	Total     int
	AllUp     bool
	Groups    []spGroup
	UpdatedAt string
}

func (s *Server) handleStatusPage(w http.ResponseWriter, r *http.Request) {
	cfg := s.getConfig()
	if cfg == nil {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	if cfg.StatusPage != nil && cfg.StatusPage.Enabled != nil && !*cfg.StatusPage.Enabled {
		http.NotFound(w, r)
		return
	}

	snap := s.Health.Snapshot()
	hist := s.Health.HistorySnapshot()

	title := "Service status"
	if cfg.StatusPage != nil && cfg.StatusPage.Title != "" {
		title = cfg.StatusPage.Title
	} else if cfg.TopBar != nil && cfg.TopBar.Header != nil && cfg.TopBar.Header.BrandText != "" {
		title = cfg.TopBar.Header.BrandText + " status"
	}

	// Group name lookup.
	groupName := map[string]string{}
	for _, g := range cfg.Groups {
		groupName[g.ID] = g.Name
	}

	// Bucket health-checked apps by group, preserving config order.
	order := []string{}
	buckets := map[string][]spService{}
	up, total := 0, 0
	for _, a := range cfg.Apps {
		if a.Health == nil || a.Health.Type == config.HealthNone || a.Health.Type == "" {
			continue
		}
		total++
		res := snap[a.ID]
		st := string(res.Status)
		if st == "" {
			st = "unknown"
		}
		if st == "healthy" {
			up++
		}
		svc := spService{
			Name:       a.Name,
			Status:     st,
			StatusText: statusText(st),
			ResponseMS: res.ResponseMS,
		}
		if pts := hist[a.ID]; len(pts) > 0 {
			healthy := 0
			for _, p := range pts {
				if p.Status == health.StatusHealthy {
					healthy++
				}
			}
			svc.HasUptime = true
			svc.UptimePct = int(float64(healthy) / float64(len(pts)) * 100)
		}
		if !res.CertExpiry.IsZero() {
			d := int(time.Until(res.CertExpiry).Hours() / 24)
			if d <= 30 { // only surface when getting close
				svc.HasCert = true
				svc.CertDays = d
			}
		}
		key := a.Group
		if _, ok := buckets[key]; !ok {
			order = append(order, key)
		}
		buckets[key] = append(buckets[key], svc)
	}

	// Keep ungrouped last; otherwise config/group order.
	sort.SliceStable(order, func(i, j int) bool { return order[i] != "" && order[j] == "" })
	var groups []spGroup
	for _, k := range order {
		name := groupName[k]
		if name == "" {
			name = "Services"
		}
		groups = append(groups, spGroup{Name: name, Services: buckets[k]})
	}

	data := spData{
		Title:     title,
		Up:        up,
		Total:     total,
		AllUp:     up == total,
		Groups:    groups,
		UpdatedAt: time.Now().Format("Jan 2, 15:04:05 MST"),
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = statusPageTmpl.Execute(w, data)
}

func statusText(s string) string {
	switch s {
	case "healthy":
		return "Operational"
	case "degraded":
		return "Degraded"
	case "down":
		return "Down"
	default:
		return "Unknown"
	}
}

var statusPageTmpl = template.Must(template.New("status").Parse(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>{{.Title}}</title>
<style>
  :root{--bg:#0b0d13;--card:#141824;--line:#232838;--tx:#e6e8ee;--mut:#8b93a7;--up:#22c55e;--deg:#f59e0b;--down:#f43f5e;--unk:#6b7280}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:40px 20px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:var(--mut);font-size:12px;margin-bottom:22px}
  .banner{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:12px;margin-bottom:24px;font-weight:600;
    border:1px solid var(--line);background:var(--card)}
  .banner .big{width:12px;height:12px;border-radius:50%}
  .banner.ok .big{background:var(--up)} .banner.bad .big{background:var(--down)}
  .grp{margin-bottom:22px}
  .grp h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:0 0 8px;font-weight:600}
  .card{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden}
  .row{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid var(--line)}
  .row:first-child{border-top:none}
  .dot{width:9px;height:9px;border-radius:50%;flex:none}
  .dot.healthy{background:var(--up)} .dot.degraded{background:var(--deg)} .dot.down{background:var(--down)} .dot.unknown{background:var(--unk)}
  .name{flex:1;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cert{font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(245,158,11,.15);color:var(--deg)}
  .cert.exp{background:rgba(244,63,94,.15);color:var(--down)}
  .pct{color:var(--mut);font-variant-numeric:tabular-nums;font-size:12px;width:80px;text-align:right}
  .st{font-size:12px;font-variant-numeric:tabular-nums;width:96px;text-align:right}
  .st.healthy{color:var(--up)} .st.degraded{color:var(--deg)} .st.down{color:var(--down)} .st.unknown{color:var(--mut)}
  footer{color:var(--mut);font-size:11px;text-align:center;margin-top:28px}
  a{color:inherit}
</style></head><body><div class="wrap">
  <h1>{{.Title}}</h1>
  <div class="sub">Updated {{.UpdatedAt}} · refreshes automatically</div>
  <div class="banner {{if .AllUp}}ok{{else}}bad{{end}}">
    <span class="big"></span>
    <span>{{if .AllUp}}All systems operational{{else}}{{.Up}} of {{.Total}} operational{{end}}</span>
  </div>
  {{range .Groups}}
  <div class="grp">
    <h2>{{.Name}}</h2>
    <div class="card">
      {{range .Services}}
      <div class="row">
        <span class="dot {{.Status}}"></span>
        <span class="name">{{.Name}}</span>
        {{if .HasCert}}<span class="cert {{if lt .CertDays 0}}exp{{else if le .CertDays 14}}exp{{end}}">{{if lt .CertDays 0}}cert expired{{else}}cert {{.CertDays}}d{{end}}</span>{{end}}
        {{if .HasUptime}}<span class="pct">{{.UptimePct}}% up</span>{{end}}
        <span class="st {{.Status}}">{{.StatusText}}</span>
      </div>
      {{end}}
    </div>
  </div>
  {{end}}
  <footer>Powered by axboard</footer>
</div></body></html>`))
