import { useQuery } from "@tanstack/react-query";
import { SkeletonLines } from "../../../../components/Skeleton";
import type {
  MarketsConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Markets ticker — crypto prices + 24h change via CoinGecko's free API
// (through the server proxy). Uses CoinGecko coin ids (bitcoin, ethereum, …).
// ---------------------------------------------------------------------------

type PriceMap = Record<string, Record<string, number>>;

function MarketsComponent({ config }: WidgetProps<MarketsConfig>) {
  const ids = config?.ids?.length ? config.ids : ["bitcoin", "ethereum"];
  const vs = (config?.vs || "usd").toLowerCase();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["markets", ids.join(","), vs],
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const api = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
        ids.join(","),
      )}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`;
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(api)}`);
      if (!r.ok) throw new Error(`markets ${r.status}`);
      return (await r.json()) as PriceMap;
    },
  });

  if (isLoading) return <SkeletonLines rows={ids.length} />;
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
      {ids.map((id) => {
        const row = data[id];
        const price = row?.[vs];
        const change = row?.[`${vs}_24h_change`];
        return (
          <div key={id} className="flex items-center gap-2 px-1.5 py-1.5">
            <span className="text-[12px] text-text-secondary capitalize flex-1 truncate">{id}</span>
            {price != null ? (
              <>
                <span className="text-[12px] font-mono tabular-nums text-text">
                  {fmt(price)} <span className="text-text-muted uppercase text-[10px]">{vs}</span>
                </span>
                {change != null && (
                  <span
                    className={`text-[11px] font-mono tabular-nums w-14 text-right ${
                      change >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(1)}%
                  </span>
                )}
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

function MarketsConfigPanel({ config, save }: WidgetConfigProps<MarketsConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Coin ids (CoinGecko, comma-separated)
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
          Currency
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
  description: "Crypto prices + 24h change (CoinGecko, via the server proxy).",
  minW: 2,
  minH: 2,
  maxW: 6,
  maxH: 8,
  defaultW: 3,
  defaultH: 3,
  defaultConfig: { ids: ["bitcoin", "ethereum"], vs: "usd" },
  Component: MarketsComponent,
  ConfigPanel: MarketsConfigPanel,
};

export default definition;
