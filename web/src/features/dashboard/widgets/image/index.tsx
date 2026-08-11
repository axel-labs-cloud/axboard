import { useEffect, useState } from "react";
import type {
  ImageConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Image / banner widget — a static image by URL, optionally linking somewhere.
// ---------------------------------------------------------------------------

function ImageComponent({ config }: WidgetProps<ImageConfig>) {
  const url = config?.url?.trim();
  const fit = config?.fit ?? "cover";
  const link = config?.link?.trim();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);

  if (!url) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted/60 text-[11px] px-3 text-center">
        Set an image URL in config.
      </div>
    );
  }

  if (broken) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5 text-text-muted/60 text-[11px] px-3 text-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="m3 16 5-5 4 4M14 14l2-2 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 3 21 21" strokeLinecap="round" />
        </svg>
        Image failed to load
      </div>
    );
  }

  const img = (
    <img
      src={url}
      alt={config?.link ? "banner" : "image"}
      onError={() => setBroken(true)}
      className="w-full h-full"
      style={{ objectFit: fit }}
      loading="lazy"
    />
  );

  if (link) {
    return (
      <a href={link} target="_blank" rel="noreferrer noopener" className="block w-full h-full">
        {img}
      </a>
    );
  }
  return <div className="w-full h-full">{img}</div>;
}

function ImageConfigPanel({ config, save }: WidgetConfigProps<ImageConfig>) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Image URL
        </label>
        <input
          value={config?.url ?? ""}
          onChange={(e) => save({ url: e.target.value })}
          placeholder="https://…/banner.png"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Fit
        </label>
        <select
          value={config?.fit ?? "cover"}
          onChange={(e) => save({ fit: e.target.value as "cover" | "contain" })}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        >
          <option value="cover">Cover — fill, crop overflow</option>
          <option value="contain">Contain — fit whole image</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Link (optional)
        </label>
        <input
          value={config?.link ?? ""}
          onChange={(e) => save({ link: e.target.value })}
          placeholder="https://… (click target)"
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const ImageIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const definition: WidgetDefinition<ImageConfig> = {
  type: "image",
  title: "Image",
  icon: ImageIcon,
  category: "productivity",
  description: "A static image or banner by URL, optionally clickable.",
  minW: 1,
  minH: 1,
  maxW: 12,
  maxH: 12,
  defaultW: 3,
  defaultH: 2,
  defaultConfig: { fit: "cover" },
  Component: ImageComponent,
  ConfigPanel: ImageConfigPanel,
};

export default definition;
