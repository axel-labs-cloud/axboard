import type { DashboardLayout } from "./widgets/types";
import { migrateLayout, CURRENT_VERSION } from "./layoutMigrations";

// ---------------------------------------------------------------------------
// Dashboard import / export
//
// File format: a single JSON object with a small wrapper around the layout
// payload. The wrapper carries metadata so we can later evolve the file
// format independently of the in-memory layout schema (which has its own
// versioning via layoutMigrations).
//
//   {
//     "format": "axboard",
//     "format_version": 1,
//     "exported_at": "2026-04-10T09:30:00Z",
//     "exported_from": "axboard",
//     "name": "Home Lab",
//     "layout": { ... DashboardLayout ... }
//   }
//
// Files are saved with a `.axboard.json` extension. The import function only
// validates the wrapper shape and then defers to migrateLayout() for the
// actual layout — so any layout that's loadable in the browser is also
// importable. Legacy format tags from earlier names ("ianua", "a1dash") are
// still accepted on import so old exports keep working across the rename.
// ---------------------------------------------------------------------------

const FORMAT = "axboard";
const LEGACY_FORMATS = ["ianua", "a1dash"];
const FORMAT_VERSION = 1;

export interface DashboardExportFile {
  format: typeof FORMAT;
  format_version: number;
  exported_at: string;
  exported_from: string;
  name: string;
  layout: DashboardLayout;
}

export function buildExportFile(name: string, layout: DashboardLayout): DashboardExportFile {
  return {
    format: FORMAT,
    format_version: FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    exported_from: "axboard",
    name,
    layout: { ...layout, version: CURRENT_VERSION },
  };
}

/** Trigger a browser download of the given dashboard as a .axboard.json file. */
export function downloadDashboardFile(name: string, layout: DashboardLayout): void {
  const file = buildExportFile(name, layout);
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Sanitise the name for the filename: lowercase, kebab-case, ascii-safe.
  const safe =
    (name || "dashboard")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dashboard";
  a.download = `${safe}.axboard.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ParsedImport {
  name: string;
  layout: DashboardLayout;
}

/**
 * Parse a `.axboard.json` JSON string into a name + layout. Throws on any structural
 * problem so the caller can render a single error message.
 */
export function parseDashboardFile(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON");
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("File is empty or not an object");
  }
  const obj = raw as Record<string, unknown>;
  const fmt = String(obj.format);
  if (fmt !== FORMAT && !LEGACY_FORMATS.includes(fmt)) {
    throw new Error(`Wrong format — expected "${FORMAT}", got "${fmt}"`);
  }
  if (typeof obj.format_version !== "number") {
    throw new Error("Missing format_version");
  }
  if (obj.format_version > FORMAT_VERSION) {
    throw new Error(
      `Format version ${obj.format_version} is newer than this client supports (${FORMAT_VERSION}). Please update.`
    );
  }
  if (!obj.layout || typeof obj.layout !== "object") {
    throw new Error("Missing layout");
  }
  // Defer to the existing layout migrator — handles version bumps + invalid
  // shapes the same way as a layout pulled from the API.
  const layout = migrateLayout(obj.layout);
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "Imported";
  return { name, layout };
}

/** Read a File via the browser File API and return its UTF-8 text contents. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
