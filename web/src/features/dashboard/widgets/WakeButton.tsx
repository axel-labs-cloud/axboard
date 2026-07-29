import { useState } from "react";
import { api } from "../../../api/client";
import type { AppDef, StatusMap } from "../../../api/types";

// canWake decides whether a service should show its Wake-on-LAN button: it needs
// a MAC configured and must not currently be healthy (hidden once the box is up).
export function canWake(app: AppDef, status?: StatusMap[string]): boolean {
  return !!app.wol?.mac && status?.status !== "healthy";
}

type WakeState = "idle" | "sending" | "ok" | "err";

// WakeButton broadcasts a Wake-on-LAN magic packet via /api/wol, mirroring the
// WOL widget's send/flash feedback. Meant to overlay a service tile.
export function WakeButton({
  mac,
  broadcast,
  className = "",
}: {
  mac: string;
  broadcast?: string;
  className?: string;
}) {
  const [state, setState] = useState<WakeState>("idle");
  const [flash, setFlash] = useState(0);
  const wake = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === "sending") return;
    setState("sending");
    try {
      const r = await api.wol(mac, broadcast);
      setState(r.ok ? "ok" : "err");
      if (r.ok) setFlash((f) => f + 1);
    } catch {
      setState("err");
    }
    window.setTimeout(() => setState("idle"), 2500);
  };
  return (
    <button
      onClick={wake}
      disabled={state === "sending"}
      title={`Wake ${mac}`}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md border overflow-hidden transition-colors ${
        state === "ok"
          ? "border-up/50 bg-up/15 text-up"
          : state === "err"
            ? "border-down/50 bg-down/15 text-down"
            : "border-border bg-bg-card/80 text-text-secondary hover:border-accent/60 hover:text-accent"
      } ${className}`}
    >
      {flash ? <span key={flash} className="wol-flash" /> : null}
      {state === "sending" ? (
        <span className="w-2.5 h-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
          <line x1="12" y1="2" x2="12" y2="12" />
        </svg>
      )}
    </button>
  );
}
