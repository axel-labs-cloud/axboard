import { useQuery } from "@tanstack/react-query";

export interface Dashboard {
  id: string;
  name: string;
  default?: boolean;
}

interface ConfigResponse {
  dashboards?: Dashboard[];
}

export function useDashboards() {
  const list = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const r = await fetch("/api/config");
      if (!r.ok) return { dashboards: [] } as ConfigResponse;
      return (await r.json()) as ConfigResponse;
    },
  });

  return {
    dashboards: list.data?.dashboards ?? [],
    loading: list.isLoading,
  };
}
