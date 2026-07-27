import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Config } from "../api/types";

// Single source of truth for the ["config"] query. Previously App.tsx and
// useDashboards.ts each registered their OWN queryFn under the same
// ["config"] key with divergent error behavior (one threw to drive the error
// screen, the other swallowed and returned an empty list). With TanStack,
// which queryFn "wins" a refetch on a shared key is not guaranteed — so both
// now go through this hook and the api.getConfig queryFn (which throws on
// non-2xx). Callers that want a soft-fail read the returned isError/isLoading.
export function useConfig() {
  return useQuery<Config>({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });
}
