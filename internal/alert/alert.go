// Package alert fans a service state-change out to the configured notification
// channels (generic webhook, ntfy, Telegram, email). It fires only on the
// transitions that matter — an app going down, or recovering from down — and
// every send is best-effort in its own goroutine so a slow channel never
// blocks the health pool.
package alert

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/smtp"
	"strings"
	"sync"
	"time"

	"gitlab.int.axel-labs.cloud/axel-labs.cloud/projects/axboard/internal/config"
)

type Notifier struct {
	mu       sync.RWMutex
	cfg      config.AlertsConfig
	client   *http.Client
	certSent map[string]string    // app → YYYY-MM-DD of last cert alert (dedup)
	downAt   map[string]time.Time // app → last "down" alert time (for resend)
}

func New() *Notifier {
	return &Notifier{
		client:   &http.Client{Timeout: 8 * time.Second},
		certSent: map[string]string{},
		downAt:   map[string]time.Time{},
	}
}

// muted reports whether an app is excluded from alerts.
func (n *Notifier) muted(app string) bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	for _, m := range n.cfg.Muted {
		if m == app {
			return true
		}
	}
	return false
}

// SetConfig swaps in the latest alert config (called on every config reload).
func (n *Notifier) SetConfig(c config.AlertsConfig) {
	n.mu.Lock()
	n.cfg = c
	n.mu.Unlock()
}

// event classifies a transition; ok is false when it isn't alert-worthy.
type event struct {
	title string
	body  string
	down  bool // vs. recovered
	app   string
	prev  string
	cur   string
}

func classify(app, prev, cur string) (event, bool) {
	wentDown := cur == "down"
	recovered := prev == "down" && cur == "healthy"
	if !wentDown && !recovered {
		return event{}, false
	}
	e := event{app: app, prev: prev, cur: cur, down: wentDown}
	if wentDown {
		e.title = app + " is DOWN"
		e.body = fmt.Sprintf("%s went down (was %s).", app, prev)
	} else {
		e.title = app + " recovered"
		e.body = fmt.Sprintf("%s is back up.", app)
	}
	return e, true
}

// Notify dispatches a transition to every configured channel. `now` seeds the
// resend clock (real time in production; injected in tests).
func (n *Notifier) Notify(app, prev, cur string, now time.Time) {
	if n.muted(app) {
		return
	}
	e, ok := classify(app, prev, cur)
	if !ok {
		return
	}
	n.mu.Lock()
	if e.down {
		n.downAt[app] = now
	} else {
		delete(n.downAt, app)
	}
	n.mu.Unlock()
	n.dispatch(e)
}

// MaybeResend re-fires the "down" alert for an app that is still down, once the
// configured resend interval has elapsed since the last alert. Call on every
// check result.
func (n *Notifier) MaybeResend(app, cur string, now time.Time) {
	if cur != "down" || n.muted(app) {
		return
	}
	n.mu.RLock()
	resend := n.cfg.ResendMinutes
	last, tracked := n.downAt[app]
	n.mu.RUnlock()
	if resend <= 0 || !tracked || now.Sub(last) < time.Duration(resend)*time.Minute {
		return
	}
	n.mu.Lock()
	n.downAt[app] = now
	n.mu.Unlock()
	n.dispatch(event{
		app: app, down: true, prev: "down", cur: "down",
		title: app + " still DOWN",
		body:  fmt.Sprintf("%s is still down.", app),
	})
}

// NotifyCert alerts when an HTTPS certificate is within the configured expiry
// threshold. Deduped to once per app per calendar day so it doesn't spam on
// every check. A negative daysLeft means the cert is already expired.
func (n *Notifier) NotifyCert(app string, daysLeft int, today string) {
	if n.muted(app) {
		return
	}
	n.mu.RLock()
	raw := n.cfg.CertExpiryDays
	last := n.certSent[app]
	n.mu.RUnlock()
	threshold := raw
	if threshold == 0 {
		threshold = 14
	}
	if raw < 0 || daysLeft > threshold || last == today {
		return
	}
	n.mu.Lock()
	n.certSent[app] = today
	n.mu.Unlock()

	e := event{app: app, down: true, prev: "healthy", cur: "healthy"}
	if daysLeft < 0 {
		e.title = app + " certificate EXPIRED"
		e.body = fmt.Sprintf("%s TLS certificate has expired.", app)
	} else {
		e.title = app + " certificate expiring"
		e.body = fmt.Sprintf("%s TLS certificate expires in %d day(s).", app, daysLeft)
	}
	n.dispatch(e)
}

// SendTest fires a sample notification to every configured channel and returns
// the channel names it triggered (so the UI can confirm what's wired up). When
// `only` is non-empty, just that channel is tested.
func (n *Notifier) SendTest(only string) []string {
	e := event{
		app:   "axboard",
		title: "axboard test alert",
		body:  "This is a test notification from axboard — your alerts are working.",
		down:  false,
		prev:  "healthy",
		cur:   "healthy",
	}
	if only == "" {
		return n.dispatch(e)
	}
	return n.dispatchOne(only, e)
}

// dispatchOne sends the event to a single named channel (for per-channel tests).
func (n *Notifier) dispatchOne(channel string, e event) []string {
	n.mu.RLock()
	cfg := n.cfg
	n.mu.RUnlock()
	switch channel {
	case "webhook":
		if cfg.WebhookURL != "" {
			go n.sendWebhook(cfg.WebhookURL, e)
			return []string{"webhook"}
		}
	case "ntfy":
		if cfg.Ntfy != nil && cfg.Ntfy.Topic != "" {
			go n.sendNtfy(*cfg.Ntfy, e)
			return []string{"ntfy"}
		}
	case "telegram":
		if cfg.Telegram != nil && cfg.Telegram.BotToken != "" && cfg.Telegram.ChatID != "" {
			go n.sendTelegram(*cfg.Telegram, e)
			return []string{"telegram"}
		}
	case "email":
		if cfg.Email != nil && cfg.Email.SMTPHost != "" && cfg.Email.To != "" {
			go n.sendEmail(*cfg.Email, e)
			return []string{"email"}
		}
	}
	return nil
}

// dispatch fans an event out to every configured channel and reports which
// ones were triggered. Sends are best-effort in their own goroutines.
func (n *Notifier) dispatch(e event) []string {
	n.mu.RLock()
	cfg := n.cfg
	n.mu.RUnlock()

	var sent []string
	if cfg.WebhookURL != "" {
		sent = append(sent, "webhook")
		go n.sendWebhook(cfg.WebhookURL, e)
	}
	if cfg.Ntfy != nil && cfg.Ntfy.Topic != "" {
		sent = append(sent, "ntfy")
		go n.sendNtfy(*cfg.Ntfy, e)
	}
	if cfg.Telegram != nil && cfg.Telegram.BotToken != "" && cfg.Telegram.ChatID != "" {
		sent = append(sent, "telegram")
		go n.sendTelegram(*cfg.Telegram, e)
	}
	if cfg.Email != nil && cfg.Email.SMTPHost != "" && cfg.Email.To != "" {
		sent = append(sent, "email")
		go n.sendEmail(*cfg.Email, e)
	}
	return sent
}

func ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 8*time.Second)
}

func (n *Notifier) sendWebhook(url string, e event) {
	payload, _ := json.Marshal(map[string]string{
		"app": e.app, "event": eventWord(e), "status": e.cur, "previous": e.prev, "title": e.title, "message": e.body,
	})
	c, cancel := ctx()
	defer cancel()
	req, err := http.NewRequestWithContext(c, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	n.do(req, "webhook", e.app)
}

// NtfyRequest builds the ntfy HTTP request (exported for testing).
func NtfyRequest(c context.Context, cfg config.NtfyConfig, e event) (*http.Request, error) {
	server := strings.TrimRight(cfg.Server, "/")
	if server == "" {
		server = "https://ntfy.sh"
	}
	req, err := http.NewRequestWithContext(c, http.MethodPost, server+"/"+cfg.Topic, strings.NewReader(e.body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Title", e.title)
	if e.down {
		req.Header.Set("Priority", "high")
		req.Header.Set("Tags", "rotating_light")
	} else {
		req.Header.Set("Priority", "default")
		req.Header.Set("Tags", "white_check_mark")
	}
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}
	return req, nil
}

func (n *Notifier) sendNtfy(cfg config.NtfyConfig, e event) {
	c, cancel := ctx()
	defer cancel()
	req, err := NtfyRequest(c, cfg, e)
	if err != nil {
		return
	}
	n.do(req, "ntfy", e.app)
}

func (n *Notifier) sendTelegram(cfg config.TelegramConfig, e event) {
	c, cancel := ctx()
	defer cancel()
	body, _ := json.Marshal(map[string]string{"chat_id": cfg.ChatID, "text": e.title + "\n" + e.body})
	url := "https://api.telegram.org/bot" + cfg.BotToken + "/sendMessage"
	req, err := http.NewRequestWithContext(c, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	n.do(req, "telegram", e.app)
}

// EmailMessage builds the RFC-822 message bytes (exported for testing).
func EmailMessage(cfg config.EmailConfig, e event) []byte {
	from := cfg.From
	if from == "" {
		from = cfg.Username
	}
	return []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: [axboard] %s\r\n\r\n%s\r\n",
		from, cfg.To, e.title, e.body))
}

func (n *Notifier) sendEmail(cfg config.EmailConfig, e event) {
	port := cfg.SMTPPort
	if port == 0 {
		port = 587
	}
	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, port)
	from := cfg.From
	if from == "" {
		from = cfg.Username
	}
	var auth smtp.Auth
	if cfg.Username != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)
	}
	if err := smtp.SendMail(addr, auth, from, []string{cfg.To}, EmailMessage(cfg, e)); err != nil {
		slog.Warn("alert email failed", "app", e.app, "err", err)
	}
}

func (n *Notifier) do(req *http.Request, channel, app string) {
	resp, err := n.client.Do(req)
	if err != nil {
		slog.Warn("alert send failed", "channel", channel, "app", app, "err", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		slog.Warn("alert send non-2xx", "channel", channel, "app", app, "status", resp.StatusCode)
	}
}

func eventWord(e event) string {
	if e.down {
		return "down"
	}
	return "recovered"
}
