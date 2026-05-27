import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConfigError, SSEEvent } from "../api/types";

export function useSSE() {
  const qc = useQueryClient();
  const [error, setError] = useState<ConfigError | null>(null);

  useEffect(() => {
    const src = new EventSource("/api/events");

    const onMessage = (e: MessageEvent) => {
      let payload: SSEEvent;
      try {
        payload = JSON.parse(e.data) as SSEEvent;
      } catch {
        return;
      }
      if (payload.type === "config_changed") {
        setError(null);
        qc.invalidateQueries({ queryKey: ["config"] });
        qc.invalidateQueries({ queryKey: ["state"] });
      } else if (payload.type === "config_error") {
        setError(payload.error);
      }
    };

    src.onmessage = onMessage;
    src.addEventListener("config_changed", onMessage as EventListener);
    src.addEventListener("config_error", onMessage as EventListener);

    return () => src.close();
  }, [qc]);

  return { error, clearError: () => setError(null) };
}
