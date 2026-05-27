import { useQuery } from "@tanstack/react-query";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { api } from "./api/client";
import { useSSE } from "./hooks/useSSE";
import { useTheme } from "./hooks/useTheme";

export function App() {
  const { isLoading, isError } = useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });

  const { error: configError, clearError } = useSSE();
  const [theme, setTheme] = useTheme();

  return (
    <div className="h-screen flex flex-col">
      {configError && (
        <div className="bg-amber-950/80 border-b border-amber-700/60 backdrop-blur px-5 py-2 flex items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-amber-300 uppercase tracking-wider text-[10px] font-semibold">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Config error
          </span>
          <span className="text-amber-100 flex-1 truncate font-mono text-[11px]">
            {configError.message}
            {configError.line ? ` (line ${configError.line})` : ""}
          </span>
          <button
            onClick={clearError}
            className="text-amber-300/80 hover:text-amber-100 w-5 h-5 flex items-center justify-center"
            title="Dismiss"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
      {isLoading ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : isError ? (
        <Centered>
          <div className="text-text-muted text-[13px] text-center">
            <div className="text-text font-medium mb-1">Cannot reach the server</div>
            <div>/api/config returned an error.</div>
          </div>
        </Centered>
      ) : (
        <DashboardPage theme={theme} setTheme={setTheme} />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex items-center justify-center">{children}</div>;
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-text-muted text-[12px]">
      <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      Loading
    </div>
  );
}
