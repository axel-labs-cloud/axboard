import { useState } from "react";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import type { WolConfig, WolTarget, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Wake-on-LAN widget — a grid of buttons that POST /api/wol to broadcast a
// magic packet. Needs host networking so the packet reaches the LAN broadcast.
// ---------------------------------------------------------------------------

type Sent = "idle" | "sending" | "ok" | "err";

function WolComponent({ config }: WidgetProps<WolConfig>) {
  const box = useSize<HTMLDivElement>();
  const targets = config?.targets ?? [];
  const [state, setState] = useState<Record<string, Sent>>({});

  const wake = async (t: WolTarget) => {
    setState((s) => ({ ...s, [t.mac]: "sending" }));
    try {
      const r = await api.wol(t.mac, t.broadcast);
      setState((s) => ({ ...s, [t.mac]: r.ok ? "ok" : "err" }));
    } catch {
      setState((s) => ({ ...s, [t.mac]: "err" }));
    }
    window.setTimeout(() => setState((s) => ({ ...s, [t.mac]: "idle" })), 2500);
  };

  if (targets.length === 0) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Open config → add a device (name + MAC).
      </div>
    );
  }

  const cols = box.w >= 420 ? 3 : box.w >= 240 ? 2 : 1;

  return (
    <div ref={box.ref} className="h-full overflow-auto p-3">
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: "8px" }}>
        {targets.map((t) => {
          const st = state[t.mac] ?? "idle";
          return (
            <button
              key={t.mac + t.name}
              onClick={() => wake(t)}
              disabled={st === "sending"}
              className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border transition-colors ${
                st === "ok" ? "border-up/50 bg-up/10 text-up"
                  : st === "err" ? "border-down/50 bg-down/10 text-down"
                  : "border-border bg-bg-card/40 text-text-secondary hover:border-accent/50 hover:text-accent"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
              </svg>
              <span className="text-[11px] font-medium truncate max-w-full">{t.name}</span>
              <span className="text-[9px] font-mono text-text-muted">
                {st === "sending" ? "sending…" : st === "ok" ? "sent ✓" : st === "err" ? "failed" : "wake"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WolConfigPanel({ config, save }: WidgetConfigProps<WolConfig>) {
  const targets = config?.targets ?? [];
  const set = (i: number, patch: Partial<WolTarget>) => {
    const next = targets.map((t, j) => (j === i ? { ...t, ...patch } : t));
    save({ targets: next });
  };
  const add = () => save({ targets: [...targets, { name: "", mac: "" }] });
  const remove = (i: number) => save({ targets: targets.filter((_, j) => j !== i) });

  return (
    <div className="space-y-2.5">
      {targets.map((t, i) => (
        <div key={i} className="space-y-1.5 rounded border border-border-subtle p-2">
          <div className="flex gap-1.5">
            <input value={t.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" className="flex-1 px-2 py-1 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent" />
            <button onClick={() => remove(i)} className="px-2 text-text-muted hover:text-down text-[12px]">✕</button>
          </div>
          <input value={t.mac} onChange={(e) => set(i, { mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" className="w-full px-2 py-1 rounded bg-bg-card border border-border text-[12px] text-text font-mono focus:outline-none focus:border-accent" />
          <input value={t.broadcast ?? ""} onChange={(e) => set(i, { broadcast: e.target.value })} placeholder="broadcast (optional, e.g. 10.10.0.255)" className="w-full px-2 py-1 rounded bg-bg-card border border-border text-[11px] text-text font-mono focus:outline-none focus:border-accent" />
        </div>
      ))}
      <button onClick={add} className="w-full px-2 py-2 rounded border border-dashed border-border text-text-muted hover:text-text hover:border-text-muted text-[12px] transition-colors">
        + Add device
      </button>
      <p className="text-[11px] text-text-muted">Needs host networking to reach the LAN broadcast.</p>
    </div>
  );
}

const WolIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
  </svg>
);

const definition: WidgetDefinition<WolConfig> = {
  type: "wol",
  title: "Wake-on-LAN",
  icon: WolIcon,
  category: "infrastructure",
  description: "One-click Wake-on-LAN buttons that broadcast magic packets.",
  minW: 2,
  minH: 1,
  maxW: 8,
  maxH: 6,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: { targets: [] },
  Component: WolComponent,
  ConfigPanel: WolConfigPanel,
};

export default definition;
