package api

import (
	"html/template"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/health"
)

// ---------------------------------------------------------------------------
// Public status pages — lightweight, server-rendered, auth-free HTML
// (Uptime-Kuma-style). Multiple pages are supported: the default lives at
// /status, named pages at /status/<slug>. Each page can set its own title,
// header/footer text, theme, group filter, and hide the axboard branding.
// No JS beyond a meta-refresh.
// ---------------------------------------------------------------------------

type spService struct {
	Name       string
	Status     string
	StatusText string
	UptimePct  int
	HasUptime  bool
	Bars       []string // per-check status classes (Uptime-Kuma-style strip)
	CertDays   int
	HasCert    bool
}

type spGroup struct {
	Name     string
	Services []spService
}

type spNotice struct {
	Severity string
	Title    string
	Message  string
}

type spData struct {
	Title        string
	Header       string
	Footer       string
	HideBranding bool
	Light        bool
	Up           int
	Total        int
	AllUp        bool
	Notices      []spNotice
	Groups       []spGroup
	UpdatedAt    string
}

// resolvePage returns the status page config for a slug ("" = default), or false
// if none matches. Falls back to the deprecated single StatusPage / a bare
// default so /status always works out of the box.
func resolvePage(cfg *config.Config, slug string) (config.StatusPageConfig, bool) {
	pages := cfg.StatusPages
	if len(pages) == 0 {
		if cfg.StatusPage != nil {
			pages = []config.StatusPageConfig{*cfg.StatusPage}
		} else {
			pages = []config.StatusPageConfig{{}}
		}
	}
	slug = strings.ToLower(strings.TrimSpace(slug))
	isDefault := func(s string) bool { return s == "" || strings.ToLower(s) == "default" }
	if isDefault(slug) {
		for _, p := range pages {
			if isDefault(p.Slug) {
				return p, true
			}
		}
		return pages[0], true
	}
	for _, p := range pages {
		if strings.ToLower(p.Slug) == slug {
			return p, true
		}
	}
	return config.StatusPageConfig{}, false
}

func (s *Server) handleStatusPage(w http.ResponseWriter, r *http.Request) {
	cfg := s.getConfig()
	if cfg == nil {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	page, ok := resolvePage(cfg, chi.URLParam(r, "slug"))
	if !ok || (page.Enabled != nil && !*page.Enabled) {
		http.NotFound(w, r)
		return
	}

	snap := s.Health.Snapshot()
	hist := s.Health.HistorySnapshot()

	title := page.Title
	if title == "" {
		if cfg.TopBar != nil && cfg.TopBar.Header != nil && cfg.TopBar.Header.BrandText != "" {
			title = cfg.TopBar.Header.BrandText + " status"
		} else {
			title = "Service status"
		}
	}

	groupName := map[string]string{}
	for _, g := range cfg.Groups {
		groupName[g.ID] = g.Name
	}
	// Optional filters: by group and/or by individual service (both must pass).
	var allowGroup, allowApp map[string]bool
	if len(page.Groups) > 0 {
		allowGroup = map[string]bool{}
		for _, g := range page.Groups {
			allowGroup[g] = true
		}
	}
	if len(page.Apps) > 0 {
		allowApp = map[string]bool{}
		for _, a := range page.Apps {
			allowApp[a] = true
		}
	}

	order := []string{}
	buckets := map[string][]spService{}
	up, total := 0, 0
	for _, a := range cfg.Apps {
		if a.Health == nil || a.Health.Type == config.HealthNone || a.Health.Type == "" {
			continue
		}
		if allowGroup != nil && !allowGroup[a.Group] {
			continue
		}
		if allowApp != nil && !allowApp[a.ID] {
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
		svc := spService{Name: a.Name, Status: st, StatusText: statusText(st)}
		if pts := hist[a.ID]; len(pts) > 0 {
			healthy := 0
			for _, p := range pts {
				if p.Status == health.StatusHealthy {
					healthy++
				}
			}
			svc.HasUptime = true
			svc.UptimePct = int(float64(healthy) / float64(len(pts)) * 100)
			// Last ~40 checks as a coloured bar strip.
			tail := pts
			if len(tail) > 40 {
				tail = tail[len(tail)-40:]
			}
			for _, p := range tail {
				svc.Bars = append(svc.Bars, string(p.Status))
			}
		}
		if !res.CertExpiry.IsZero() {
			if d := int(time.Until(res.CertExpiry).Hours() / 24); d <= 30 {
				svc.HasCert = true
				svc.CertDays = d
			}
		}
		if _, seen := buckets[a.Group]; !seen {
			order = append(order, a.Group)
		}
		buckets[a.Group] = append(buckets[a.Group], svc)
	}
	sort.SliceStable(order, func(i, j int) bool { return order[i] != "" && order[j] == "" })

	var groups []spGroup
	for _, k := range order {
		name := groupName[k]
		if name == "" {
			name = "Services"
		}
		groups = append(groups, spGroup{Name: name, Services: buckets[k]})
	}

	var notices []spNotice
	for _, n := range page.Notices {
		if n.Active != nil && !*n.Active {
			continue
		}
		sev := strings.ToLower(n.Severity)
		if sev == "" {
			sev = "info"
		}
		notices = append(notices, spNotice{Severity: sev, Title: n.Title, Message: n.Message})
	}

	data := spData{
		Title:        title,
		Header:       page.Header,
		Footer:       page.Footer,
		HideBranding: page.HideBranding,
		Light:        strings.EqualFold(page.Theme, "light"),
		Up:           up,
		Total:        total,
		AllUp:        total > 0 && up == total,
		Notices:      notices,
		Groups:       groups,
		UpdatedAt:    time.Now().Format("Jan 2, 15:04:05 MST"),
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
<html lang="en" class="{{if .Light}}light{{end}}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>{{.Title}}</title>
<style>
  :root{--bg:#0b0d13;--card:#141824;--line:#232838;--tx:#e6e8ee;--mut:#8b93a7;--up:#22c55e;--deg:#f59e0b;--down:#f43f5e;--unk:#6b7280}
  html.light{--bg:#f6f7f9;--card:#ffffff;--line:#e4e7ec;--tx:#1a1d24;--mut:#697086;--up:#16a34a;--deg:#d97706;--down:#dc2626;--unk:#9ca3af}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:40px 20px}
  h1{font-size:22px;margin:0 0 4px}
  .hdr{color:var(--mut);font-size:13px;margin:0 0 8px;white-space:pre-wrap}
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
  .bars{display:flex;gap:2px;align-items:stretch;height:22px;flex:1;min-width:60px;max-width:260px}
  .bars span{flex:1;border-radius:2px;background:var(--unk)}
  .bars span.healthy{background:var(--up)} .bars span.degraded{background:var(--deg)} .bars span.down{background:var(--down)}
  .pct{color:var(--mut);font-variant-numeric:tabular-nums;font-size:12px;width:64px;text-align:right}
  .st{font-size:12px;font-variant-numeric:tabular-nums;width:96px;text-align:right}
  .st.healthy{color:var(--up)} .st.degraded{color:var(--deg)} .st.down{color:var(--down)} .st.unknown{color:var(--mut)}
  footer{color:var(--mut);font-size:11px;text-align:center;margin-top:28px;white-space:pre-wrap}
  a{color:inherit}
  .notice{border:1px solid var(--line);border-left-width:4px;border-radius:10px;padding:12px 14px;margin-bottom:12px;background:var(--card)}
  .notice .nt{font-weight:600;font-size:13px;margin-bottom:2px}
  .notice .nm{color:var(--mut);font-size:12px;white-space:pre-wrap}
  .notice.info{border-left-color:#3b82f6} .notice.info .nt{color:#3b82f6}
  .notice.warning{border-left-color:var(--deg)} .notice.warning .nt{color:var(--deg)}
  .notice.critical{border-left-color:var(--down)} .notice.critical .nt{color:var(--down)}
  .notice.maintenance{border-left-color:#8b5cf6} .notice.maintenance .nt{color:#8b5cf6}
</style></head><body><div class="wrap">
  <h1>{{.Title}}</h1>
  {{if .Header}}<div class="hdr">{{.Header}}</div>{{end}}
  <div class="sub">Updated {{.UpdatedAt}} · refreshes automatically</div>
  {{range .Notices}}
  <div class="notice {{.Severity}}">
    {{if .Title}}<div class="nt">{{.Title}}</div>{{end}}
    {{if .Message}}<div class="nm">{{.Message}}</div>{{end}}
  </div>
  {{end}}
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
        {{if .Bars}}<span class="bars">{{range .Bars}}<span class="{{.}}"></span>{{end}}</span>{{end}}
        {{if .HasCert}}<span class="cert {{if lt .CertDays 0}}exp{{else if le .CertDays 14}}exp{{end}}">{{if lt .CertDays 0}}cert expired{{else}}cert {{.CertDays}}d{{end}}</span>{{end}}
        {{if .HasUptime}}<span class="pct">{{.UptimePct}}%</span>{{end}}
        <span class="st {{.Status}}">{{.StatusText}}</span>
      </div>
      {{end}}
    </div>
  </div>
  {{end}}
  {{if .Footer}}<footer>{{.Footer}}</footer>{{else if not .HideBranding}}<footer>Powered by axboard</footer>{{end}}
</div></body></html>`))
