import { WidgetHeader, EmptyState, ErrorState } from "../../../../components/widget";
import { SkeletonLines } from "../../../../components/Skeleton";
import { ConfigField } from "../_fields";
import { hbase, useHassStates, useHassService, useHassOptimistic, useSharedHassCreds, EntityPicker, isMedia, friendly, OpenInHass } from "../_hass";
import type { HassOneConfig, WidgetConfigProps, WidgetDefinition, WidgetProps } from "../types";

// ---------------------------------------------------------------------------
// Home Assistant media player — now-playing, transport (prev/play-pause/next)
// and a volume slider for one media_player entity.
// ---------------------------------------------------------------------------

function MediaComponent({ config }: WidgetProps<HassOneConfig>) {
  const b = hbase(config?.baseUrl);
  const token = config?.token?.trim();
  const id = config?.entity?.trim();
  const ready = !!b && !!token && !!id;

  const { data, isLoading, isError, error, refetch } = useHassStates(b, token ?? "", ready, 5_000);
  const svc = useHassService(b, token ?? "");
  const opt = useHassOptimistic(b, token ?? "");

  if (!b || !token || !id) return <EmptyState icon={NoteIcon} title="Connect Media" hint="Set the base URL, a long-lived token and a media_player.* entity." />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Could not reach Home Assistant."} onRetry={() => refetch()} />;
  if (isLoading || !data) return <SkeletonLines rows={2} />;

  const e = data.find((x) => x.entity_id === id);
  const st = e?.state ?? "off";
  const playing = st === "playing";
  const title = (e?.attributes?.media_title as string | undefined) ?? "";
  const artist = (e?.attributes?.media_artist as string | undefined) ?? (e?.attributes?.media_series_title as string | undefined) ?? (e?.attributes?.app_name as string | undefined) ?? "";
  const vol = (e?.attributes?.volume_level as number | undefined) ?? null;
  const call = (service: string, extra?: Record<string, unknown>) =>
    svc.mutate({ domain: "media_player", service, data: { entity_id: id, ...extra } });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WidgetHeader
        icon={NoteIcon}
        title={config?.title?.trim() || friendly(e, id)}
        right={<span className="flex items-center gap-1.5"><span className={`text-[11px] font-mono ${playing ? "text-up" : "text-text-muted"}`}>{st}</span><OpenInHass base={b} id={id} /></span>}
      />
      <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex flex-col justify-center gap-2">
        {(title || artist) && (
          <div className="min-w-0">
            {title && <div className="text-[12.5px] text-text truncate">{title}</div>}
            {artist && <div className="text-[11px] text-text-muted truncate">{artist}</div>}
          </div>
        )}
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => call("media_previous_track")} title="Previous" className="text-text-muted hover:text-accent"><Prev /></button>
          <button
            onClick={() => { opt(id, playing ? "paused" : "playing"); call("media_play_pause"); }}
            title="Play / pause"
            className="w-9 h-9 rounded-full border border-border text-text hover:border-accent hover:text-accent flex items-center justify-center"
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <button onClick={() => call("media_next_track")} title="Next" className="text-text-muted hover:text-accent"><Next /></button>
        </div>
        {vol != null && (
          <div className="flex items-center gap-2">
            <VolIcon />
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={Math.round(vol * 100)}
              key={Math.round(vol * 100)}
              onMouseUp={(ev) => { const v = Number((ev.target as HTMLInputElement).value); opt(id, st, { volume_level: v / 100 }); call("volume_set", { volume_level: v / 100 }); }}
              onTouchEnd={(ev) => { const v = Number((ev.target as HTMLInputElement).value); opt(id, st, { volume_level: v / 100 }); call("volume_set", { volume_level: v / 100 }); }}
              className="flex-1 accent-accent h-1 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-text-muted w-7 text-right">{Math.round(vol * 100)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaConfigPanel({ config, save }: WidgetConfigProps<HassOneConfig>) {
  useSharedHassCreds(config?.baseUrl, config?.token, save);
  const b = hbase(config?.baseUrl);
  return (
    <div className="space-y-3">
      <ConfigField label="Base URL" value={config?.baseUrl} onChange={(baseUrl) => save({ baseUrl })} placeholder="http://172.24.2.100:8123" hint="shared" />
      <ConfigField label="Access token" value={config?.token} onChange={(token) => save({ token })} placeholder="long-lived token" hint="shared" />
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">Media player</label>
        <EntityPicker base={b} token={config?.token?.trim() ?? ""} filter={isMedia} multiple={false} value={config?.entity ? [config.entity] : []} onChange={(ids) => save({ entity: ids[0] })} />
      </div>
      <ConfigField label="Title" value={config?.title} onChange={(title) => save({ title })} placeholder="(entity name)" mono={false} />
    </div>
  );
}

const NoteIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
);
const Play = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>;
const Pause = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>;
const Prev = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 6h2v12H6zM20 6l-9 6 9 6z" /></svg>;
const Next = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M16 6h2v12h-2zM4 6l9 6-9 6z" /></svg>;
const VolIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-text-muted shrink-0"><path d="M11 5 6 9H3v6h3l5 4zM16 9a3 3 0 0 1 0 6" /></svg>;

const definition: WidgetDefinition<HassOneConfig> = {
  type: "hamedia",
  title: "HA Media",
  icon: NoteIcon,
  category: "homeassistant",
  description: "Home Assistant media player — now-playing, prev/play-pause/next and volume.",
  minW: 2,
  minH: 2,
  maxW: 5,
  maxH: 4,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: {},
  Component: MediaComponent,
  ConfigPanel: MediaConfigPanel,
};

export default definition;
