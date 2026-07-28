import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonLines } from "../../../../components/Skeleton";
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
// ---------------------------------------------------------------------------

interface Row {
  key: string;
  label: string;
  price: number | null;
  change: number | null; // percent
  unit: string;
  kind: "crypto" | "stock";
}

type PriceMap = Record<string, Record<string, number>>;

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency?: string;
      };
    }>;
  };
}

async function fetchCrypto(ids: string[], vs: string): Promise<Row[]> {
  if (ids.length === 0) return [];
  const api = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(","),
  )}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`;
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(api)}`);
  if (!r.ok) throw new Error(`crypto ${r.status}`);
  const data = (await r.json()) as PriceMap;
  return ids.map((id) => {
    const row = data[id];
    return {
      key: `c:${id}`,
      label: id,
      price: row?.[vs] ?? null,
      change: row?.[`${vs}_24h_change`] ?? null,
      unit: vs.toUpperCase(),
      kind: "crypto" as const,
    };
  });
}

async function fetchStock(sym: string): Promise<Row> {
  const api = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`;
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(api)}`);
  if (!r.ok) throw new Error(`stock ${r.status}`);
  const data = (await r.json()) as YahooChart;
  const m = data.chart?.result?.[0]?.meta;
  const price = m?.regularMarketPrice ?? null;
  const prev = m?.chartPreviousClose ?? m?.previousClose ?? null;
  const change = price != null && prev ? ((price - prev) / prev) * 100 : null;
  return {
    key: `s:${sym}`,
    label: (m?.symbol ?? sym).toUpperCase(),
    price,
    change,
    unit: m?.currency?.toUpperCase() ?? "",
    kind: "stock",
  };
}

function MarketsComponent({ config }: WidgetProps<MarketsConfig>) {
  const ids = config?.ids ?? [];
  const stocks = config?.stocks ?? [];
  const vs = (config?.vs || "usd").toLowerCase();
  const empty = ids.length === 0 && stocks.length === 0;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["markets", ids.join(","), stocks.join(","), vs],
    enabled: !empty,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Row[]> => {
      const [crypto, ...stockRows] = await Promise.all([
        fetchCrypto(ids, vs),
        ...stocks.map((s) => fetchStock(s).catch(() => ({
          key: `s:${s}`,
          label: s.toUpperCase(),
          price: null,
          change: null,
          unit: "",
          kind: "stock" as const,
        }))),
      ]);
      return [...crypto, ...stockRows];
    },
  });

  if (empty) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Add coins or stock tickers in config.
      </div>
    );
  }
  if (isLoading) return <SkeletonLines rows={ids.length + stocks.length || 2} />;
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/70 text-[11px] px-3 text-center">
        Could not load prices.
      </div>
    );
  }

  const fmt = (n: number) =>
    n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toPrecision(4);

  return (
    <div className="h-full overflow-auto p-2 divide-y divide-border-subtle">
      {data.map((row) => (
        <div key={row.key} className="flex items-center gap-2 px-1.5 py-1.5">
          <span
            className={`text-[9px] font-mono shrink-0 w-3 ${row.kind === "crypto" ? "text-accent" : "text-text-muted"}`}
            title={row.kind}
          >
            {row.kind === "crypto" ? "₿" : "$"}
          </span>
          <span
            className={`text-[12px] text-text-secondary flex-1 truncate ${row.kind === "crypto" ? "capitalize" : "uppercase"}`}
          >
            {row.label}
          </span>
          {row.price != null ? (
            <>
              <span className="text-[12px] font-mono tabular-nums text-text">
                {fmt(row.price)}{" "}
                {row.unit && <span className="text-text-muted uppercase text-[10px]">{row.unit}</span>}
              </span>
              {row.change != null && (
                <span
                  className={`text-[11px] font-mono tabular-nums w-14 text-right ${
                    row.change >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {row.change >= 0 ? "+" : ""}
                  {row.change.toFixed(1)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-text-muted">—</span>
          )}
        </div>
      ))}
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
  description: "Crypto (CoinGecko) + stock/ETF (Yahoo) prices with daily change.",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { ids: ["bitcoin", "ethereum"], stocks: ["NVDA"], vs: "usd" },
  Component: MarketsComponent,
  ConfigPanel: MarketsConfigPanel,
};

export default definition;
