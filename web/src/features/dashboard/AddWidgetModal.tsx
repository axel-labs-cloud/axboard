import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import type { Config } from "../../api/types";
import { listWidgetDefinitions } from "./widgets/registry";
import type { WidgetType } from "./widgets/types";

interface Props {
  open: boolean;
  dashboardId: string | null;
  onClose: () => void;
  onCreated?: (newWidgetId: string) => void;
}

export function AddWidgetModal({ open, dashboardId, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const cached = qc.getQueryData<Config>(["config"]);

  const add = useMutation({
    mutationFn: async (type: WidgetType) => {
      if (!cached || !dashboardId) throw new Error("config not loaded");
      const def = listWidgetDefinitions().find((d) => d.type === type);
      if (!def) throw new Error(`unknown widget type ${type}`);

      const newId = `w-${Date.now()}`;
      const next: Config = {
        ...cached,
        dashboards: (cached.dashboards ?? []).map((d) =>
          d.id === dashboardId
            ? {
                ...d,
                widgets: [
                  ...(d.widgets ?? []),
                  {
                    i: newId,
                    type: def.type,
                    title: def.title,
                    config: def.defaultConfig as Record<string, unknown>,
                  },
                ],
              }
            : d,
        ),
      };
      await api.putConfig(next);
      return newId;
    },
    onSuccess: (newId) => {
      qc.invalidateQueries({ queryKey: ["config"] });
      onCreated?.(newId);
      onClose();
    },
  });

  if (!open) return null;

  const defs = listWidgetDefinitions();

  return createPortal(
    <div
      className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="animate-pop-in bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-2xl ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-[13px] font-semibold text-text">Add widget</span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text w-6 h-6 flex items-center justify-center"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-2.5">
          {defs.map((def) => (
            <button
              key={def.type}
              onClick={() => add.mutate(def.type)}
              disabled={add.isPending || !dashboardId}
              className="text-left flex items-start gap-3 p-3 rounded border border-border-subtle bg-bg-card/40 hover:border-accent/40 hover:bg-bg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="w-8 h-8 rounded-md bg-bg-elevated flex items-center justify-center text-text-secondary shrink-0">
                {def.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-text font-medium">{def.title}</div>
                <div className="text-[11px] text-text-muted leading-snug mt-0.5 line-clamp-2">
                  {def.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        {add.isError && (
          <div className="px-4 py-2 bg-rose-950/40 border-t border-rose-700/40 text-[11px] text-rose-200">
            {(add.error as Error).message}
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-border-subtle text-[10.5px] text-text-muted">
          Adds an instance to the current dashboard. Writes{" "}
          <span className="font-mono text-text-secondary">config.yaml</span> — comments and
          formatting will be lost on save.
        </div>
      </div>
    </div>,
    document.body,
  );
}
