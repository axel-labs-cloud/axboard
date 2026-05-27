import type { DashboardLayout, DashboardLayoutV1 } from "./widgets/types";

// ---------------------------------------------------------------------------
// Layout schema migrations
// When loading a saved layout, check the version field and run migrations
// to bring it up to the current version. Always save at current version.
// ---------------------------------------------------------------------------

export const CURRENT_VERSION = 1;

// migrations[N] converts a layout from version N to version N+1
const migrations: Record<number, (old: any) => any> = {
  // Version 0 → 1: add version field, ensure layouts.lg exists
  0: (old: any) => ({
    version: 1,
    widgets: old.widgets || [],
    layouts: old.layouts || { lg: [] },
  }),
  // Future: 1 → 2 migrations go here
};

export function migrateLayout(raw: any): DashboardLayout {
  if (!raw || typeof raw !== "object") {
    return { version: CURRENT_VERSION, widgets: [], layouts: { lg: [] } };
  }

  // Treat missing version as 0 (legacy format)
  let current = raw.version ?? 0;
  let layout = raw;

  while (current < CURRENT_VERSION) {
    const migrate = migrations[current];
    if (!migrate) {
      console.error(`No migration from version ${current}, falling back to empty layout`);
      return { version: CURRENT_VERSION, widgets: [], layouts: { lg: [] } };
    }
    layout = migrate(layout);
    current = layout.version;
  }

  // Reject newer-than-current versions (user has older client)
  if (current > CURRENT_VERSION) {
    throw new Error(
      `Dashboard layout version ${current} is newer than supported version ${CURRENT_VERSION}. Please update.`
    );
  }

  return layout as DashboardLayoutV1;
}

export function createEmptyLayout(): DashboardLayout {
  return {
    version: CURRENT_VERSION,
    widgets: [],
    layouts: { lg: [] },
  };
}
