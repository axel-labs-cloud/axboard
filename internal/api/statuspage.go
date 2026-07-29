package api

import (
	"fmt"
	"html/template"
	"net/http"
	"sort"
	"strconv"
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
	AvgMS      int64
	HasMS      bool
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
	Accent       string
	WrapW        template.CSS
	HasBg        bool
	BgStyle      template.CSS
	Dim          int
	Up           int
	Total        int
	AllUp        bool
	Notices      []spNotice
	Groups       []spGroup
	UpdatedAt    string
}

// bgStyle builds the CSS for the background layer (image/gradient/color + blur).
func bgStyle(b *config.StatusBackground) (template.CSS, bool) {
	if b == nil {
		return "", false
	}
	var css string
	switch b.Type {
	case "image":
		if b.Image == "" {
			return "", false
		}
		css = "background-image:url('" + strings.ReplaceAll(b.Image, "'", "%27") + "');background-size:cover;background-position:center;"
		if b.Blur > 0 {
			css += "filter:blur(" + itoa(b.Blur) + "px);"
		}
	case "gradient":
		if b.Gradient == "" {
			return "", false
		}
		css = "background:" + sanitizeCSS(b.Gradient) + ";"
	case "color":
		if b.Color == "" {
			return "", false
		}
		css = "background:" + sanitizeCSS(b.Color) + ";"
	default:
		return "", false
	}
	return template.CSS(css), true
}

// sanitizeCSS strips characters that could break out of the value context.
func sanitizeCSS(s string) string {
	return strings.NewReplacer(";", "", "}", "", "{", "", "<", "", ">", "").Replace(s)
}

func itoa(n int) string { return strconv.Itoa(n) }

func wrapWidth(w string) template.CSS {
	switch strings.ToLower(w) {
	case "wide":
		return "1040px"
	case "full":
		return "min(1600px,96vw)"
	default:
		return "760px"
	}
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
		// Prefer the 30-day windowed uptime (disk-backed) when available.
		if u := s.Health.Uptime(); u != nil {
			if pct, ok := u.Window(a.ID, 30*24*time.Hour, time.Now()); ok {
				svc.HasUptime = true
				svc.UptimePct = pct
			}
		}
		pts := hist[a.ID]
		if len(pts) > 0 {
			if !svc.HasUptime { // fall back to recent history if no 30d data
				healthy := 0
				for _, p := range pts {
					if p.Status == health.StatusHealthy {
						healthy++
					}
				}
				svc.HasUptime = true
				svc.UptimePct = int(float64(healthy) / float64(len(pts)) * 100)
			}
			// Average response time over samples that recorded one.
			var sum, n int64
			for _, p := range pts {
				if p.ResponseMS > 0 {
					sum += p.ResponseMS
					n++
				}
			}
			if n > 0 {
				svc.HasMS = true
				svc.AvgMS = sum / n
			}
		}
		// Always render a fixed strip; empty cells fill in from the right as
		// checks accumulate (like a typical status page).
		const barCount = 30
		tail := pts
		if len(tail) > barCount {
			tail = tail[len(tail)-barCount:]
		}
		svc.Bars = make([]string, barCount)
		for i := range svc.Bars {
			svc.Bars[i] = "empty"
		}
		for i, p := range tail {
			svc.Bars[barCount-len(tail)+i] = string(p.Status)
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

	bg, hasBg := bgStyle(page.Background)
	dim := 0
	if page.Background != nil {
		dim = page.Background.Dim
	}
	data := spData{
		Title:        title,
		Header:       page.Header,
		Footer:       page.Footer,
		HideBranding: page.HideBranding,
		Light:        strings.EqualFold(page.Theme, "light"),
		Accent:       sanitizeCSS(page.Accent),
		WrapW:        wrapWidth(page.Width),
		HasBg:        hasBg,
		BgStyle:      bg,
		Dim:          dim,
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

// handleBadge renders an embeddable shields-style SVG uptime badge for one app
// at /status/badge/{id}. Value = recent uptime % (or the status word).
func (s *Server) handleBadge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	res := s.Health.Get(id)
	hist := s.Health.HistorySnapshot()[id]

	label := "uptime"
	value := statusText(string(res.Status))
	color := "#9ca3af"
	if len(hist) > 0 {
		healthy := 0
		for _, p := range hist {
			if p.Status == health.StatusHealthy {
				healthy++
			}
		}
		pct := int(float64(healthy) / float64(len(hist)) * 100)
		value = strconv.Itoa(pct) + "%"
		switch {
		case pct >= 99:
			color = "#22c55e"
		case pct >= 90:
			color = "#84cc16"
		case pct >= 75:
			color = "#f59e0b"
		default:
			color = "#f43f5e"
		}
	} else {
		switch res.Status {
		case health.StatusHealthy:
			color = "#22c55e"
		case health.StatusDegraded:
			color = "#f59e0b"
		case health.StatusDown:
			color = "#f43f5e"
		}
	}

	lw := 6*len(label) + 12
	vw := 6*len(value) + 14
	total := lw + vw
	svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="20" role="img" aria-label="%s: %s">
<linearGradient id="s" x2="0" y2="100%%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<rect rx="3" width="%d" height="20" fill="#555"/>
<rect rx="3" x="%d" width="%d" height="20" fill="%s"/>
<rect rx="3" width="%d" height="20" fill="url(#s)"/>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="%d" y="14">%s</text><text x="%d" y="14">%s</text></g></svg>`,
		total, label, value, lw, lw, vw, color, total, lw/2, label, lw+vw/2, value)

	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write([]byte(svg))
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
  :root{--bg:#0b0d13;--card:#141824;--line:#232838;--tx:#e6e8ee;--mut:#8b93a7;--up:#22c55e;--deg:#f59e0b;--down:#f43f5e;--unk:#6b7280;--accent:#818cf8}
  html.light{--bg:#f6f7f9;--card:#ffffff;--line:#e4e7ec;--tx:#1a1d24;--mut:#697086;--up:#16a34a;--deg:#d97706;--down:#dc2626;--unk:#9ca3af}
  {{if .Accent}}:root{--accent:{{.Accent}}}{{end}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh}
  .bglayer{position:fixed;inset:-60px;z-index:-2;transform:scale(1.08);{{.BgStyle}}}
  .bgdim{position:fixed;inset:0;z-index:-1;background:rgb(0 0 0 / {{.Dim}}%)}
  .wrap{max-width:{{.WrapW}};margin:0 auto;padding:40px 20px;position:relative}
  /* When a custom backdrop is set, make the cards glassy so it shows through. */
  body.themed .banner,body.themed .card,body.themed .notice{background:color-mix(in srgb,var(--card) 78%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
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
  .bars{display:flex;gap:3px;align-items:stretch;height:26px;flex:1;min-width:90px;max-width:360px}
  .bars span{flex:1;border-radius:2px;background:var(--line);min-width:4px}
  .bars span.healthy{background:var(--up)} .bars span.degraded{background:var(--deg)} .bars span.down{background:var(--down)} .bars span.unknown{background:var(--unk)}
  .ms{color:var(--mut);font-variant-numeric:tabular-nums;font-size:11px;width:56px;text-align:right}
  .pct{color:var(--mut);font-variant-numeric:tabular-nums;font-size:12px;width:56px;text-align:right}
  .st{font-size:12px;font-variant-numeric:tabular-nums;width:96px;text-align:right}
  .st.healthy{color:var(--up)} .st.degraded{color:var(--deg)} .st.down{color:var(--down)} .st.unknown{color:var(--mut)}
  footer{color:var(--mut);font-size:11px;text-align:center;margin-top:28px;white-space:pre-wrap}
  a{color:var(--accent)}
  .notice{border:1px solid var(--line);border-left-width:4px;border-radius:10px;padding:12px 14px;margin-bottom:12px;background:var(--card)}
  .notice .nt{font-weight:600;font-size:13px;margin-bottom:2px}
  .notice .nm{color:var(--mut);font-size:12px;white-space:pre-wrap}
  .notice.info{border-left-color:#3b82f6} .notice.info .nt{color:#3b82f6}
  .notice.warning{border-left-color:var(--deg)} .notice.warning .nt{color:var(--deg)}
  .notice.critical{border-left-color:var(--down)} .notice.critical .nt{color:var(--down)}
  .notice.maintenance{border-left-color:#8b5cf6} .notice.maintenance .nt{color:#8b5cf6}
</style></head><body class="{{if .HasBg}}themed{{end}}">
  {{if .HasBg}}<div class="bglayer"></div>{{if gt .Dim 0}}<div class="bgdim"></div>{{end}}{{end}}
  <div class="wrap">
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
        {{if .HasMS}}<span class="ms">{{.AvgMS}}ms</span>{{end}}
        {{if .HasUptime}}<span class="pct">{{.UptimePct}}%</span>{{end}}
        <span class="st {{.Status}}">{{.StatusText}}</span>
      </div>
      {{end}}
    </div>
  </div>
  {{end}}
  {{if .Footer}}<footer>{{.Footer}}</footer>{{else if not .HideBranding}}<footer>Powered by axboard</footer>{{end}}
</div></body></html>`))
