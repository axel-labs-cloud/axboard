import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Config } from "../api/types";

// Fires a browser notification when an app transitions into "down" while the
// tab is open. Complements the server-side webhook alerter. No notification is
// sent for apps that are already down on first load (the baseline is seeded
// silently), so enabling it doesn't produce a burst.
export function useDownAlerts(enabled: boolean) {
  const qc = useQueryClient();
  const { data: statuses } = useQuery({
    queryKey: ["apps-status"],
    queryFn: api.getStatus,
    refetchInterval: 15_000,
    enabled,
  });
  const prev = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!enabled || !statuses) return;
    const snapshot = Object.fromEntries(
      Object.entries(statuses).map(([id, s]) => [id, s.status]),
    );
    const canNotify =
      typeof Notification !== "undefined" && Notification.permission === "granted";

    if (canNotify) {
      const cfg = qc.getQueryData<Config>(["config"]);
      const names = new Map((cfg?.apps ?? []).map((a) => [a.id, a.name]));
      for (const [id, cur] of Object.entries(snapshot)) {
        const before = prev.current[id];
        if (cur === "down" && before && before !== "down") {
          try {
            new Notification("axboard", {
              body: `${names.get(id) ?? id} is down`,
              icon: "/favicon.svg",
            });
          } catch {
            // some browsers require a ServiceWorker for notifications; ignore
          }
        }
      }
    }
    prev.current = snapshot;
  }, [statuses, enabled, qc]);
}
