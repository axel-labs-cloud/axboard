import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ErrorState } from "../../../../components/widget";
import type {
  MarketsConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Markets ticker — crypto prices (CoinGecko) + stock/ETF quotes (Yahoo
// Finance), both fetched through the server proxy to dodge CORS.
//   - Coin ids are CoinGecko slugs: bitcoin, ethereum, monero, …
//   - Stock tickers are Yahoo symbols: NVDA, AAPL, ^GSPC, BTC-EUR, …
//
// The layout is size-driven: small → a compact price list, medium → each row
// gets an inline sparkline, large → each symbol becomes a full line-chart card
// over the configured history window (period).
// ---------------------------------------------------------------------------

interface Period {
  id: string;
  label: string;
  cgDays: number; // CoinGecko `days`
  yRange: string; // Yahoo `range`
  yInterval: string; // Yahoo `interval`
}

const PERIODS: Period[] = [
  { id: "1d", label: "1D", cgDays: 1, yRange: "1d", yInterval: "5m" },
  { id: "1w", label: "1W", cgDays: 7, yRange: "5d", yInterval: "30m" },
  { id: "1m", label: "1M", cgDays: 30, yRange: "1mo", yInterval: "1d" },
  { id: "3m", label: "3M", cgDays: 90, yRange: "3mo", yInterval: "1d" },
  { id: "1y", label: "1Y", cgDays: 365, yRange: "1y", yInterval: "1wk" },
  { id: "5y", label: "5Y", cgDays: 1825, yRange: "5y", yInterval: "1mo" },
];

function periodOf(id: string | undefined): Period {
  return PERIODS.find((p) => p.id === id) ?? PERIODS[2]; // default 1M
}

interface Row {
  key: string;
  label: string;
  price: number | null;
  change: number | null; // percent over the selected period
  unit: string;
  kind: "crypto" | "stock";
  history: number[]; // close series over the period
}

const PROXY = (u: string) => `/api/proxy?url=${encodeURIComponent(u)}`;

interface CgChart {
  prices?: [number, number][];
}

async function fetchCrypto(id: string, vs: string, p: Period): Promise<Row> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(
    id,
  )}/market_chart?vs_currency=${encodeURIComponent(vs)}&days=${p.cgDays}`;
  const r = await fetch(PROXY(url));
  if (!r.ok) throw new Error(`crypto ${r.status}`);
  const data = (await r.json()) as CgChart;
  const history = (data.prices ?? []).map((pt) => pt[1]).filter((n) => Number.isFinite(n));
  const price = history.length ? history[history.length - 1] : null;
  const first = history[0];
  const change = price != null && first ? ((price - first) / first) * 100 : null;
  return { key: `c:${id}`, label: id, price, change, unit: vs.toUpperCase(), kind: "crypto", history };
}

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; regularMarketPrice?: number; currency?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }>;
  };
}

async function fetchStock(sym: string, p: Period): Promise<Row> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    sym,
  )}?range=${p.yRange}&interval=${p.yInterval}`;
  const r = await fetch(PROXY(url));
  if (!r.ok) throw new Error(`stock ${r.status}`);
  const data = (await r.json()) as YahooChart;
  const res = data.chart?.result?.[0];
  const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter(
    (n): n is number => n != null && Number.isFinite(n),
  );
  const last = closes.length ? closes[closes.length - 1] : null;
  const price = res?.meta?.regularMarketPrice ?? last;
  const first = closes[0];
  const change = price != null && first ? ((price - first) / first) * 100 : null;
  return {
    key: `s:${sym}`,
    label: (res?.meta?.symbol ?? sym).toUpperCase(),
    price,
    change,
    unit: res?.meta?.currency?.toUpperCase() ?? "",
    kind: "stock",
    history: closes,
  };
}

/** Tracks the pixel size of a container so layout can react to it. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: Math.round(cr.width), h: Math.round(cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}

// SVG line chart drawn on a normalized 0..100 viewBox so it scales freely to
// whatever box the layout gives it (non-scaling stroke keeps the line crisp).
function LineChart({ data, up, id }: { data: number[]; up: boolean; id: string }) {
  if (data.length < 2) {
    return <div className="h-full flex items-center text-[10px] text-text-muted px-1">no history</div>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;
  const pts = data.map((v, i) => {
    const x = (i / (n - 1)) * 100;
    const y = 100 - ((v - min) / range) * 96 - 2; // 2% padding top/bottom
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const line = `M${pts.join(" L")}`;
  const area = `${line} L100 100 L0 100 Z`;
  const color = up ? "var(--color-up)" : "var(--color-down)";
  const gid = `mkt-grad-${id}`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return <span className="w-14 shrink-0" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;
  const pts = data
    .map((v, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(100 - ((v - min) / range) * 100).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-14 h-6 shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--color-up)" : "var(--color-down)"}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ChangeTag({ change }: { change: number | null }) {
  if (change == null) return null;
  return (
    <span
      className={`text-[11px] font-mono tabular-nums text-right ${change >= 0 ? "text-up" : "text-down"}`}
    >
      {change >= 0 ? "+" : ""}
      {change.toFixed(1)}%
    </span>
  );
}

function Marker({ kind }: { kind: Row["kind"] }) {
  return (
    <span
      className={`text-[10px] font-mono shrink-0 w-3 ${kind === "crypto" ? "text-accent" : "text-text-muted"}`}
      title={kind}
    >
      {kind === "crypto" ? "₿" : "$"}
    </span>
  );
}

function MarketsComponent({ config }: WidgetProps<MarketsConfig>) {
  const ids = config?.ids ?? [];
  const stocks = config?.stocks ?? [];
  const vs = (config?.vs || "usd").toLowerCase();
  const period = periodOf(config?.period);
  const empty = ids.length === 0 && stocks.length === 0;
  const box = useSize<HTMLDivElement>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["markets", ids.join(","), stocks.join(","), vs, period.id],
    enabled: !empty,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Row[]> => {
      const settle = async <T,>(pr: Promise<T>, fallback: T): Promise<T> => pr.catch(() => fallback);
      const cryptoRows = ids.map((id) =>
        settle(fetchCrypto(id, vs, period), {
          key: `c:${id}`, label: id, price: null, change: null, unit: vs.toUpperCase(), kind: "crypto" as const, history: [],
        }),
      );
      const stockRows = stocks.map((s) =>
        settle(fetchStock(s, period), {
          key: `s:${s}`, label: s.toUpperCase(), price: null, change: null, unit: "", kind: "stock" as const, history: [],
        }),
      );
      return Promise.all([...cryptoRows, ...stockRows]);
    },
  });

  if (empty) {
    return (
      <div ref={box.ref} className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Add coins or stocks in config.
      </div>
    );
  }
  if (isLoading) return <div ref={box.ref} className="h-full"><SkeletonLines rows={ids.length + stocks.length || 2} /></div>;
  if (isError || !data) {
    return (
      <div ref={box.ref} className="h-full">
        <ErrorState message="Could not load prices." />
      </div>
    );
  }

  const n = data.length;
  const rowH = box.h > 0 ? box.h / n : 0;
  // Mode selection from the measured box. Charts need real vertical room.
  const chartMode = box.w >= 200 && rowH >= 96;
  const sparkMode = !chartMode && box.w >= 230;

  if (chartMode) {
    return (
      <div ref={box.ref} className="h-full overflow-auto flex flex-col gap-1.5 p-1.5">
        <div className="flex items-center justify-end px-1 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-text-muted/70">{period.label} history</span>
        </div>
        {data.map((row) => {
          const up = (row.change ?? 0) >= 0;
          return (
            <div key={row.key} className="flex-1 min-h-[84px] rounded-md bg-bg-card/40 border border-border-subtle flex flex-col">
              <div className="flex items-center gap-2 px-2 pt-1.5 shrink-0">
                <Marker kind={row.kind} />
                <span className={`text-[12px] text-text-secondary flex-1 truncate ${row.kind === "crypto" ? "capitalize" : "uppercase"}`}>
                  {row.label}
                </span>
                {row.price != null && (
                  <span className="text-[12px] font-mono tabular-nums text-text">
                    {fmtPrice(row.price)} <span className="text-text-muted uppercase text-[10px]">{row.unit}</span>
                  </span>
                )}
                <ChangeTag change={row.change} />
              </div>
              <div className="flex-1 min-h-0 px-1 pb-1">
                <LineChart data={row.history} up={up} id={row.key} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={box.ref} className="h-full overflow-auto p-2 divide-y divide-border-subtle">
      {data.map((row) => {
        const up = (row.change ?? 0) >= 0;
        return (
          <div key={row.key} className="flex items-center gap-2 px-1.5 py-1.5">
            <Marker kind={row.kind} />
            <span className={`text-[12px] text-text-secondary flex-1 truncate ${row.kind === "crypto" ? "capitalize" : "uppercase"}`}>
              {row.label}
            </span>
            {sparkMode && <Spark data={row.history} up={up} />}
            {row.price != null ? (
              <>
                <span className="text-[12px] font-mono tabular-nums text-text">
                  {fmtPrice(row.price)}{" "}
                  {row.unit && <span className="text-text-muted uppercase text-[10px]">{row.unit}</span>}
                </span>
                <span className="w-14 text-right">
                  <ChangeTag change={row.change} />
                </span>
              </>
            ) : (
              <span className="text-[11px] text-text-muted">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- search picker -------------------------------------------------------

interface Hit {
  kind: "crypto" | "stock";
  value: string; // coin id or ticker
  label: string; // display name
  sub: string; // symbol / exchange
}

async function searchMarkets(q: string): Promise<Hit[]> {
  const px = (u: string) => `/api/proxy?url=${encodeURIComponent(u)}`;
  const [cg, yh] = await Promise.allSettled([
    fetch(px(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`)).then((r) => r.json()),
    fetch(px(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`)).then((r) => r.json()),
  ]);
  const out: Hit[] = [];
  if (cg.status === "fulfilled") {
    const coins = (cg.value?.coins ?? []) as Array<{ id: string; name: string; symbol: string }>;
    for (const c of coins.slice(0, 6))
      out.push({ kind: "crypto", value: c.id, label: c.name, sub: (c.symbol || "").toUpperCase() });
  }
  if (yh.status === "fulfilled") {
    const quotes = (yh.value?.quotes ?? []) as Array<{
      symbol: string;
      shortname?: string;
      longname?: string;
      exchDisp?: string;
      quoteType?: string;
    }>;
    for (const q2 of quotes.filter((x) => x.symbol && x.quoteType !== "OPTION").slice(0, 6))
      out.push({
        kind: "stock",
        value: q2.symbol,
        label: q2.shortname || q2.longname || q2.symbol,
        sub: q2.exchDisp || q2.quoteType || "",
      });
  }
  return out;
}

function Chip({ marker, text, onRemove }: { marker: string; text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded bg-bg-card border border-border text-[11px] text-text">
      <span className="text-text-muted font-mono">{marker}</span>
      <span className="truncate max-w-[120px]">{text}</span>
      <button onClick={onRemove} className="text-text-muted hover:text-danger px-0.5 leading-none" title="Remove">
        ×
      </button>
    </span>
  );
}

function MarketsConfigPanel({ config, save }: WidgetConfigProps<MarketsConfig>) {
  const ids = config?.ids ?? [];
  const stocks = config?.stocks ?? [];
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setBusy(true);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await searchMarkets(term);
        if (alive) setHits(r);
      } catch {
        if (alive) setHits([]);
      } finally {
        if (alive) setBusy(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const add = (h: Hit) => {
    if (h.kind === "crypto") {
      if (!ids.includes(h.value)) save({ ids: [...ids, h.value] });
    } else {
      if (!stocks.includes(h.value)) save({ stocks: [...stocks, h.value] });
    }
    setQ("");
    setHits([]);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Add a coin or stock
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search — bitcoin, nvidia, S&P 500…"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        {(busy || hits.length > 0) && q.trim().length >= 2 && (
          <div className="rounded border border-border bg-bg-elevated max-h-56 overflow-auto divide-y divide-border-subtle">
            {busy && hits.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-text-muted">Searching…</div>
            )}
            {hits.map((h) => {
              const already = h.kind === "crypto" ? ids.includes(h.value) : stocks.includes(h.value);
              return (
                <button
                  key={`${h.kind}:${h.value}`}
                  onClick={() => add(h)}
                  disabled={already}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-bg-hover disabled:opacity-40 disabled:cursor-default"
                >
                  <span className={`text-[10px] font-mono w-3 shrink-0 ${h.kind === "crypto" ? "text-accent" : "text-text-muted"}`}>
                    {h.kind === "crypto" ? "₿" : "$"}
                  </span>
                  <span className="text-[12px] text-text flex-1 truncate">{h.label}</span>
                  <span className="text-[10px] text-text-muted font-mono uppercase shrink-0">{h.sub}</span>
                  {already && <span className="text-[10px] text-up shrink-0">added</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(ids.length > 0 || stocks.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <Chip key={`c:${id}`} marker="₿" text={id} onRemove={() => save({ ids: ids.filter((x) => x !== id) })} />
          ))}
          {stocks.map((s) => (
            <Chip key={`s:${s}`} marker="$" text={s} onRemove={() => save({ stocks: stocks.filter((x) => x !== s) })} />
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Chart period
        </label>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => {
            const active = periodOf(config?.period).id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => save({ period: p.id })}
                className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${
                  active
                    ? "bg-accent/15 border-accent text-accent"
                    : "bg-bg-card border-border text-text-muted hover:text-text"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-text-muted leading-snug">
          Grow the widget tall to switch from the price list to per-symbol charts over this window.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Coin currency
        </label>
        <input
          value={config?.vs ?? "usd"}
          onChange={(e) => save({ vs: e.target.value.trim().toLowerCase() || "usd" })}
          placeholder="usd"
          className="w-24 px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const MarketsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const definition: WidgetDefinition<MarketsConfig> = {
  type: "markets",
  title: "Markets",
  icon: MarketsIcon,
  category: "external",
  description: "Crypto (CoinGecko) + stock/ETF (Yahoo) prices; grows into line charts.",
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 12,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { ids: ["bitcoin", "ethereum"], stocks: ["NVDA"], vs: "usd", period: "1m" },
  Component: MarketsComponent,
  ConfigPanel: MarketsConfigPanel,
};

export default definition;
