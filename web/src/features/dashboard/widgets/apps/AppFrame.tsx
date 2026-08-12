import { useEffect } from "react";
import { createPortal } from "react-dom";

// Workspace/portal overlay — opens an app inside a full-screen in-page iframe
// with a top bar, instead of a new tab. Many apps refuse framing
// (X-Frame-Options / CSP); the top bar always offers "open in new tab" as an
// escape hatch, and Escape closes.
export function AppFrame({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-bg flex flex-col animate-pop-in">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-elevated">
        <span className="text-[13px] font-medium text-text truncate flex-1">{name}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title="Open in a new tab"
          className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-bg-hover"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
        </a>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="w-7 h-7 flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-bg-hover"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <iframe src={url} title={name} className="flex-1 w-full border-0 bg-white" />
    </div>,
    document.body,
  );
}
