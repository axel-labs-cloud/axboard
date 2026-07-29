import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";

// LoginPage gates the SPA when server.auth is configured. On success it clears
// the query cache so every gated query (config, status, …) refetches with the
// new session cookie.
export function LoginPage() {
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username, password);
      await qc.invalidateQueries();
    } catch {
      setError("Invalid username or password");
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs bg-bg-elevated border border-border-subtle rounded-2xl shadow-xl p-6 flex flex-col gap-4"
      >
        <div className="text-center">
          <div className="text-text font-semibold text-lg tracking-tight">axboard</div>
          <div className="text-text-muted text-[12px] mt-0.5">Sign in to continue</div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-muted">Username</span>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="bg-bg border border-border-subtle rounded-lg px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-text-muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="bg-bg border border-border-subtle rounded-lg px-3 py-2 text-[13px] text-text outline-none focus:border-accent"
          />
        </label>

        {error && <div className="text-[12px] text-down text-center">{error}</div>}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="bg-accent text-white rounded-lg px-3 py-2 text-[13px] font-medium disabled:opacity-50 hover:brightness-110 transition"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
