import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import type { AlertsDef } from "../../api/types";

// ---------------------------------------------------------------------------
// Alerts settings modal — configure down/recover notifications entirely from
// the UI (no hand-editing config.yaml). Saves the whole `alerts` block via the
// config write-path. A "Send test" button fires a sample through every
// configured channel.
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
      />
      {hint && <span className="block text-[10px] text-text-muted">{hint}</span>}
    </label>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle/70 p-3 space-y-2.5">
      <div>
        <div className="text-[12px] font-semibold text-text">{title}</div>
        <div className="text-[11px] text-text-muted">{subtitle}</div>
      </div>
      {children}
    </section>
  );
}

export function AlertsPanel({
  open,
  onClose,
  alerts,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  alerts: AlertsDef | undefined;
  onSave: (a: AlertsDef) => void;
}) {
  const [draft, setDraft] = useState<AlertsDef>({});
  const [testMsg, setTestMsg] = useState<string>("");
  const [testing, setTesting] = useState(false);

  // Load the current config into the draft when the panel opens. Depends only
  // on `open` so a save (which updates `alerts`) doesn't clobber the draft or
  // the test result mid-session.
  useEffect(() => {
    if (open) {
      setDraft(structuredClone(alerts ?? {}));
      setTestMsg("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ntfy = draft.ntfy ?? {};
  const tg = draft.telegram ?? {};
  const email = draft.email ?? {};
  const setNtfy = (p: Partial<typeof ntfy>) => setDraft((d) => ({ ...d, ntfy: { ...d.ntfy, ...p } }));
  const setTg = (p: Partial<typeof tg>) => setDraft((d) => ({ ...d, telegram: { ...d.telegram, ...p } }));
  const setEmail = (p: Partial<typeof email>) => setDraft((d) => ({ ...d, email: { ...d.email, ...p } }));

  // Build a cleaned alerts object, dropping empty channels so config.yaml stays tidy.
  const clean = (): AlertsDef => {
    const c: AlertsDef = {};
    if (draft.webhook_url?.trim()) c.webhook_url = draft.webhook_url.trim();
    if (ntfy.topic?.trim()) c.ntfy = { topic: ntfy.topic.trim(), ...(ntfy.server?.trim() ? { server: ntfy.server.trim() } : {}), ...(ntfy.token?.trim() ? { token: ntfy.token.trim() } : {}) };
    if (tg.bot_token?.trim() && tg.chat_id?.trim()) c.telegram = { bot_token: tg.bot_token.trim(), chat_id: tg.chat_id.trim() };
    if (email.smtp_host?.trim() && email.to?.trim())
      c.email = {
        smtp_host: email.smtp_host.trim(),
        smtp_port: email.smtp_port || 587,
        username: email.username?.trim() || "",
        password: email.password || "",
        from: email.from?.trim() || "",
        to: email.to.trim(),
      };
    return c;
  };

  const save = () => {
    onSave(clean());
    onClose();
  };

  const runTest = async () => {
    setTesting(true);
    setTestMsg("");
    try {
      // Persist the current settings first (without closing) so the backend
      // tests exactly what's on screen, then wait for the config to land.
      onSave(clean());
      await new Promise((r) => setTimeout(r, 400));
      const res = await api.testAlert();
      setTestMsg(res.ok ? `Sent to: ${res.channels?.join(", ")} — check your device.` : "No channels configured.");
    } catch (e) {
      setTestMsg((e as Error).message || "Test failed");
    }
    setTesting(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Alert settings"
        className="w-[min(560px,94vw)] max-h-[88vh] overflow-auto rounded-xl bg-bg-elevated border border-border shadow-2xl ring-1 ring-white/5 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle sticky top-0 bg-bg-elevated">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-accent">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="text-[14px] font-semibold text-text">Alerts</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text text-[13px]">✕</button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-text-muted leading-snug">
            Get notified when a health-checked service goes <span className="text-down">down</span> or{" "}
            <span className="text-up">recovers</span>. Every configured channel fires. Leave a section blank to disable it.
          </p>

          <Section title="ntfy" subtitle="Zero infra — push to a topic on ntfy.sh or your own server.">
            <Field label="Topic" value={ntfy.topic ?? ""} onChange={(v) => setNtfy({ topic: v })} placeholder="my-homelab-alerts" />
            <Field label="Server" value={ntfy.server ?? ""} onChange={(v) => setNtfy({ server: v })} placeholder="https://ntfy.sh (default)" />
            <Field label="Access token" value={ntfy.token ?? ""} onChange={(v) => setNtfy({ token: v })} placeholder="optional" type="password" />
          </Section>

          <Section title="Telegram" subtitle="A bot token from @BotFather + your chat id.">
            <Field label="Bot token" value={tg.bot_token ?? ""} onChange={(v) => setTg({ bot_token: v })} placeholder="123456:ABC-DEF…" type="password" />
            <Field label="Chat id" value={tg.chat_id ?? ""} onChange={(v) => setTg({ chat_id: v })} placeholder="987654321" />
          </Section>

          <Section title="Email" subtitle="Send through your SMTP relay.">
            <div className="grid grid-cols-2 gap-2">
              <Field label="SMTP host" value={email.smtp_host ?? ""} onChange={(v) => setEmail({ smtp_host: v })} placeholder="smtp.example.com" />
              <Field label="Port" value={email.smtp_port ? String(email.smtp_port) : ""} onChange={(v) => setEmail({ smtp_port: parseInt(v) || undefined })} placeholder="587" />
              <Field label="Username" value={email.username ?? ""} onChange={(v) => setEmail({ username: v })} placeholder="bot@example.com" />
              <Field label="Password" value={email.password ?? ""} onChange={(v) => setEmail({ password: v })} placeholder="app password" type="password" />
              <Field label="From" value={email.from ?? ""} onChange={(v) => setEmail({ from: v })} placeholder="axboard@example.com" />
              <Field label="To" value={email.to ?? ""} onChange={(v) => setEmail({ to: v })} placeholder="you@example.com" />
            </div>
          </Section>

          <Section title="Webhook" subtitle="A plain JSON POST — Discord, Slack, or a custom endpoint.">
            <Field label="Webhook URL" value={draft.webhook_url ?? ""} onChange={(v) => setDraft((d) => ({ ...d, webhook_url: v }))} placeholder="https://hooks.example.com/…" />
          </Section>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-border-subtle sticky bottom-0 bg-bg-elevated">
          <button
            onClick={runTest}
            disabled={testing}
            className="px-3 py-1.5 text-[12px] rounded border border-border text-text-secondary hover:text-text hover:border-text-muted transition-colors"
          >
            {testing ? "Sending…" : "Save & send test"}
          </button>
          {testMsg && <span className="text-[11px] text-text-muted truncate">{testMsg}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-[12px] rounded text-text-muted hover:text-text">Cancel</button>
            <button onClick={save} className="px-3 py-1.5 text-[12px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors">Save</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
