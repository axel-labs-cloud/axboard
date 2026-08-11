import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ErrorState } from "../../../../components/widget";
import type {
  CalendarConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Calendar widget — reads an iCal (.ics) URL through the server proxy and
// lists upcoming events. Minimal parser: unfold lines, pull SUMMARY + DTSTART.
// ---------------------------------------------------------------------------

interface CalEvent {
  summary: string;
  start: Date;
  allDay: boolean;
}

function parseICSDate(v: string): { date: Date; allDay: boolean } | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  const allDay = !m[4];
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  return { date, allDay };
}

function parseICS(text: string): CalEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events: CalEvent[] = [];
  let cur: Partial<CalEvent> | null = null;
  for (const line of unfolded.split(/\r?\n/)) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur && cur.summary && cur.start) events.push(cur as CalEvent);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const name = line.slice(0, idx).split(";")[0];
      const val = line.slice(idx + 1);
      if (name === "SUMMARY") cur.summary = val.replace(/\\,/g, ",").replace(/\\n/g, " ");
      else if (name === "DTSTART") {
        const parsed = parseICSDate(val);
        if (parsed) {
          cur.start = parsed.date;
          cur.allDay = parsed.allDay;
        }
      }
    }
  }
  return events;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function MonthView({
  events,
  offset,
  onOffset,
}: {
  events: CalEvent[];
  offset: number;
  onOffset: (o: number) => void;
}) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + offset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const counts: Record<number, number> = {};
  for (const e of events) {
    if (e.start.getFullYear() === year && e.start.getMonth() === month) {
      counts[e.start.getDate()] = (counts[e.start.getDate()] ?? 0) + 1;
    }
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const NavBtn = ({ dir, label }: { dir: number; label: string }) => (
    <button
      onClick={() => onOffset(offset + dir)}
      className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-bg-hover"
      title={dir < 0 ? "Previous month" : "Next month"}
    >
      {label}
    </button>
  );

  return (
    <div className="h-full flex flex-col p-2.5 gap-1.5 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <NavBtn dir={-1} label="‹" />
        <button
          onClick={() => onOffset(0)}
          className="text-[12px] font-medium text-text hover:text-accent"
          title="Back to today"
        >
          {base.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </button>
        <NavBtn dir={1} label="›" />
      </div>
      <div className="grid grid-cols-7 gap-0.5 shrink-0">
        {WEEKDAYS.map((wd, i) => (
          <div key={i} className="text-center text-[9px] text-text-muted uppercase">
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 flex-1 min-h-0">
        {cells.map((d, i) => {
          const isToday = isThisMonth && d === today.getDate();
          return (
            <div
              key={i}
              className={`flex flex-col items-center justify-center rounded text-[11px] tabular-nums ${
                d == null
                  ? ""
                  : isToday
                    ? "bg-accent/15 text-accent font-semibold ring-1 ring-accent/30"
                    : "text-text-secondary"
              }`}
            >
              {d && <span>{d}</span>}
              {d != null && (
                <span
                  className={`w-1 h-1 rounded-full mt-0.5 ${counts[d] ? "bg-accent" : "bg-transparent"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarComponent({ config, w, h }: WidgetProps<CalendarConfig>) {
  const url = config?.url?.trim();
  const count = config?.count ?? 6;
  const view = config?.view ?? "agenda";
  const [monthOffset, setMonthOffset] = useState(0);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["calendar", url],
    enabled: !!url,
    refetchInterval: Math.max(1, config?.refreshMin ?? 30) * 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(url as string)}`);
      if (!r.ok) throw new Error(`calendar fetch failed (${r.status})`);
      return parseICS(await r.text());
    },
  });

  // Month view renders the calendar grid even without a feed — the dots (events)
  // are a bonus that appear once an iCal URL is set.
  if (view === "month") {
    if (w < 3 || h < 3) {
      return (
        <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
          Month view needs at least a 3×3 widget.
        </div>
      );
    }
    return <MonthView events={data ?? []} offset={monthOffset} onOffset={setMonthOffset} />;
  }

  // Agenda view needs a feed.
  if (!url) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Set an iCal (.ics) URL in config, or switch to month view.
      </div>
    );
  }
  if (isLoading) {
    return <SkeletonLines rows={4} />;
  }
  if (isError || !data) {
    return <ErrorState message={(error as Error)?.message ?? "Could not load calendar."} />;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = data
    .filter((e) => e.start >= startOfToday)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, count);

  return (
    <div className="h-full overflow-auto p-2 divide-y divide-border-subtle">
      {upcoming.length === 0 && (
        <div className="text-[11px] text-text-muted px-1 py-2">No upcoming events.</div>
      )}
      {upcoming.map((e, i) => (
        <div key={i} className="flex items-center gap-2.5 px-1.5 py-1.5">
          <div className="flex flex-col items-center justify-center w-9 shrink-0 rounded bg-bg-elevated py-0.5">
            <span className="text-[9px] uppercase text-text-muted leading-none">
              {e.start.toLocaleDateString(undefined, { month: "short" })}
            </span>
            <span className="text-[14px] font-mono text-text leading-tight">{e.start.getDate()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] text-text-secondary leading-snug line-clamp-2">{e.summary}</div>
            <div className="text-[10px] text-text-muted">
              {e.allDay
                ? "All day"
                : e.start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarConfigPanel({ config, save }: WidgetConfigProps<CalendarConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          iCal URL (.ics)
        </label>
        <input
          value={config?.url ?? ""}
          onChange={(e) => save({ url: e.target.value })}
          placeholder="https://…/calendar.ics"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          View
        </label>
        <div className="inline-flex p-0.5 rounded-md border border-border-subtle bg-bg-card/40">
          {(["agenda", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => save({ view: v })}
              className={`px-3 py-1 text-[11px] rounded capitalize transition-colors ${
                (config?.view ?? "agenda") === v
                  ? "bg-bg-elevated text-text shadow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="text-[10.5px] text-text-muted">Month view needs at least a 3×3 widget.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
            Events (agenda)
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={config?.count ?? 6}
            onChange={(e) => save({ count: Number(e.target.value) || 6 })}
            className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
            Refresh (min)
          </label>
          <input
            type="number"
            min={1}
            max={360}
            value={config?.refreshMin ?? 30}
            onChange={(e) => save({ refreshMin: Number(e.target.value) || 30 })}
            className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
          />
        </div>
      </div>
    </div>
  );
}

const CalendarIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const definition: WidgetDefinition<CalendarConfig> = {
  type: "calendar",
  title: "Calendar",
  icon: CalendarIcon,
  category: "external",
  description: "Upcoming events from an iCal (.ics) feed (via the server proxy).",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 12,
  defaultW: 3,
  defaultH: 4,
  defaultConfig: { count: 6 },
  Component: CalendarComponent,
  ConfigPanel: CalendarConfigPanel,
};

export default definition;
