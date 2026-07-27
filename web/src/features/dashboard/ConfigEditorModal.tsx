import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

// In-app editor for config.yaml. Loads the raw file (comments intact), lets the
// user edit it, and saves it verbatim through PUT /api/config/raw which
// validates server-side and returns a line-anchored error on failure.
export function ConfigEditorModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    api
      .getRawConfig()
      .then((t) => setText(t))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.putRawConfig(text);
      // The file watcher will reload + broadcast; refresh eagerly too.
      qc.invalidateQueries({ queryKey: ["config"] });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[160] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="text-[13px] font-semibold text-text">
            Edit <span className="font-mono text-text-secondary">config.yaml</span>
          </span>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text w-6 h-6 flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 p-3">
          {loading ? (
            <div className="h-full flex items-center justify-center text-text-muted text-[12px]">Loading…</div>
          ) : (
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="w-full h-full resize-none rounded bg-bg-card border border-border text-[12px] text-text font-mono p-3 focus:outline-none focus:border-accent leading-relaxed"
            />
          )}
        </div>

        {error && (
          <div className="px-4 py-2 bg-rose-950/40 border-t border-rose-700/40 text-[11px] text-rose-200 font-mono whitespace-pre-wrap">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
          <span className="text-[10.5px] text-text-muted">
            Validated on save. Comments and formatting are preserved. ⌘/Ctrl+S to save.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] rounded border border-border text-text-secondary hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || loading}
              className="px-3 py-1.5 text-[12px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
