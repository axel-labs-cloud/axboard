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

function MarketsConfigPanel({ config, save }: WidgetConfigProps<MarketsConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Coins (CoinGecko ids, comma-separated)
        </label>
        <input
          value={(config?.ids ?? []).join(", ")}
          onChange={(e) =>
            save({ ids: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) })
          }
          placeholder="bitcoin, ethereum, monero"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Stocks / ETFs (Yahoo tickers, comma-separated)
        </label>
        <input
          value={(config?.stocks ?? []).join(", ")}
          onChange={(e) =>
            save({ stocks: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) })
          }
          placeholder="NVDA, AAPL, ^GSPC"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent font-mono"
        />
        <p className="text-[10px] text-text-muted leading-snug">
          Any Yahoo Finance symbol works — indices (^GSPC, ^IXIC), FX (EURUSD=X), even crypto (BTC-EUR).
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
