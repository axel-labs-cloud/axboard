import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../../api/client";
import { useSize } from "../useSize";
import { ColorControls, scaleColor, type ColorConfig } from "../colorScale";
import { Meter } from "../../../../components/widget";
import { ReorderPicker } from "../ReorderPicker";
import type { DisksConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";
import type { HostStats } from "../../../../api/types";

// ---------------------------------------------------------------------------
// Filesystems widget — a usage bar for every selected mount. Mounts are chosen
// from a checklist (default: all). Colour from the shared scale.
// ---------------------------------------------------------------------------

const OPTS = { lo: 0, hi: 100, warn: 75, crit: 90 };

function fmtBytes(n: number): string {
  if (n <= 0) return "0";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i >= 3 ? 1 : 0)}${u[i]}`;
}

const NET_FS = /^(nfs|cifs|smb|fuse\.sshfs)/;
function netTag(type: string): string | null {
  if (!NET_FS.test(type)) return null;
  if (type.startsWith("nfs")) return "NFS";
  if (type.startsWith("cifs") || type.startsWith("smb")) return "SMB";
  return "SSHFS";
}

function DisksComponent({ config }: WidgetProps<DisksConfig>) {
  const box = useSize<HTMLDivElement>();
  const { data, isError } = useQuery({ queryKey: ["host"], queryFn: api.getHost, refetchInterval: 15_000 });

  const fs = useMemo(() => {
    const all = data?.filesystems ?? [];
    const byPath = new Map(all.map((f) => [f.path, f]));
    const sel = config?.mounts;
    if (sel && sel.length) {
      // Preserve the user's chosen order.
      return sel.map((p) => byPath.get(p)).filter(Boolean) as typeof all;
    }
    return [...all].sort((a, b) => b.total - a.total);
  }, [data, config?.mounts]);

  if (isError || !data) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">Host stats unavailable.</div>;
  }
  if ((data.filesystems ?? []).length === 0) {
    return <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">No filesystems reported.</div>;
  }

  const cols = box.w >= 440 ? 2 : 1;
  // Fit to height: show as many mounts as fit and distribute them to fill —
  // no scroll, no big blank. Each extra row of height shows more mounts.
  const ROW_H = 34;
  const perCol = Math.max(1, Math.floor((box.h - 12) / ROW_H));
  const shown = fs.slice(0, perCol * cols);

  return (
    <div ref={box.ref} className="h-full overflow-hidden px-3 py-2.5">
      <div className="h-full" style={{ display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, columnGap: "14px", rowGap: "8px", alignContent: "space-between" }}>
        {shown.map((d) => {
          const pct = d.total > 0 ? (d.used / d.total) * 100 : 0;
          const color = scaleColor(pct, config as ColorConfig, OPTS);
          const tag = netTag(d.type);
          return (
            <div key={d.path} className="space-y-1">
              <div className="flex items-baseline justify-between text-[11px] gap-2">
                <span className="text-text-secondary font-mono truncate flex items-center gap-1.5">
                  {tag && <span className="px-1 py-px rounded bg-accent/15 text-accent text-[9px] font-sans font-semibold not-italic shrink-0">{tag}</span>}
                  <span className="truncate">{d.path}</span>
                </span>
                <span className="font-mono tabular-nums text-text-muted shrink-0">{fmtBytes(d.used)}/{fmtBytes(d.total)}</span>
              </div>
              <Meter pct={Math.min(100, pct)} color={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisksConfigPanel({ config, save }: WidgetConfigProps<DisksConfig>) {
  const qc = useQueryClient();
  const host = qc.getQueryData<HostStats>(["host"]);
  const all = host?.filesystems ?? [];
  const enabled = config?.mounts && config.mounts.length ? config.mounts : all.map((f) => f.path);

  return (
    <div className="space-y-3">
      {all.length === 0 ? (
        <p className="text-[11px] text-text-muted">No filesystems detected yet.</p>
      ) : (
        <ReorderPicker
          all={all.map((f) => ({ key: f.path, label: f.path, extra: fmtBytes(f.total) }))}
          enabled={enabled}
          onChange={(keys) => save({ mounts: keys })}
        />
      )}
      <ColorControls cfg={config} save={save} opts={OPTS} unit="%" />
    </div>
  );
}

const DisksIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="2" y="4" width="20" height="6" rx="1" /><rect x="2" y="14" width="20" height="6" rx="1" />
    <line x1="6" y1="7" x2="6.01" y2="7" /><line x1="6" y1="17" x2="6.01" y2="17" />
  </svg>
);

const definition: WidgetDefinition<DisksConfig> = {
  type: "disks",
  title: "Filesystems",
  icon: DisksIcon,
  category: "infrastructure",
  description: "Usage bars for the host filesystems you pick.",
  minW: 2,
  minH: 2,
  maxW: 10,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: {},
  Component: DisksComponent,
  ConfigPanel: DisksConfigPanel,
};

export default definition;
