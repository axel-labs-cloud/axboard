import type { AxServiceConfig, WidgetConfigProps } from "../types";

// Shared credentials panel for axdnsd/axlbd widgets.
export function AxConfigPanel({ config, save }: WidgetConfigProps<AxServiceConfig>) {
  const field = (
    label: string,
    key: keyof AxServiceConfig,
    type = "text",
    placeholder = "",
  ) => (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">{label}</label>
      <input
        type={type}
        value={(config?.[key] as string) ?? ""}
        onChange={(e) => save({ [key]: e.target.value } as Partial<AxServiceConfig>)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
      />
    </div>
  );
  return (
    <div className="space-y-3">
      {field("Base URL", "baseUrl", "text", "https://dns.int.axel-labs.cloud")}
      {field("Username", "username")}
      {field("Password", "password", "password")}
      <p className="text-[11px] text-text-muted leading-snug">
        Credentials persist in state.yaml in plaintext — LAN-bound, single-user (same trust model as
        the Concentus widget).
      </p>
    </div>
  );
}
