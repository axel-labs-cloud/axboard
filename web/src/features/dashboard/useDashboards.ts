import { useConfig } from "../../hooks/useConfig";
import type { DashboardDef } from "../../api/types";

export type Dashboard = DashboardDef;

// Read-only view of the dashboards list, sourced from the shared ["config"]
// query (see useConfig). No create/delete/rename here — the dashboard CRUD
// write-path lives in DashboardPage and goes through PUT /api/config.
export function useDashboards() {
  const { data, isLoading } = useConfig();
  return {
    dashboards: data?.dashboards ?? [],
    loading: isLoading,
  };
}
