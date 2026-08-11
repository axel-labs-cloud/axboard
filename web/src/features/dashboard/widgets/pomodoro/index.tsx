import { useEffect, useRef, useState } from "react";
import type {
  PomodoroConfig,
  WidgetConfigProps,
  WidgetDefinition,
  WidgetProps,
} from "../types";

// ---------------------------------------------------------------------------
// Pomodoro widget — work/break cycles with start/pause/reset. Self-contained.
// ---------------------------------------------------------------------------

function PomodoroComponent({ config }: WidgetProps<PomodoroConfig>) {
  const workMin = config?.work ?? 25;
  const breakMin = config?.break ?? 5;

  const [mode, setMode] = useState<"work" | "break">("work");
  const [remaining, setRemaining] = useState(workMin * 60);
  const [running, setRunning] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Reset the clock when the configured durations change (and not running).
  useEffect(() => {
    if (!running) setRemaining((modeRef.current === "work" ? workMin : breakMin) * 60);
  }, [workMin, breakMin, running]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        // Switch mode when the timer hits zero.
        const next = modeRef.current === "work" ? "break" : "work";
        setMode(next);
        return (next === "work" ? workMin : breakMin) * 60;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, workMin, breakMin]);

  const total = (mode === "work" ? workMin : breakMin) * 60;
  const pct = total > 0 ? ((total - remaining) / total) * 100 : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const tone = mode === "work" ? "text-accent" : "text-up";

  const reset = () => {
    setRunning(false);
    setMode("work");
    setRemaining(workMin * 60);
  };

  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 px-3">
      <span
        className={`text-[10px] uppercase tracking-[0.12em] font-semibold ${mode === "work" ? "text-accent" : "text-up"}`}
      >
        {mode === "work" ? "Focus" : "Break"}
      </span>
      <div className={`text-4xl font-mono font-semibold tabular-nums leading-none ${tone}`}>
        {mm}:{ss}
      </div>
      <div className="w-full max-w-[160px] h-1 rounded-full bg-border-subtle overflow-hidden">
        <div className={mode === "work" ? "h-full bg-accent" : "h-full bg-up"} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <button
          onClick={() => setRunning((r) => !r)}
          className="px-3 py-1 text-[11px] rounded border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          onClick={reset}
          className="px-3 py-1 text-[11px] rounded border border-border text-text-secondary hover:text-text"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function PomodoroConfigPanel({ config, save }: WidgetConfigProps<PomodoroConfig>) {
  const num = (v: string, fb: number) => Math.max(1, Math.min(180, Number(v) || fb));
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Focus (min)
        </label>
        <input
          type="number"
          min={1}
          max={180}
          value={config?.work ?? 25}
          onChange={(e) => save({ work: num(e.target.value, 25) })}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Break (min)
        </label>
        <input
          type="number"
          min={1}
          max={180}
          value={config?.break ?? 5}
          onChange={(e) => save({ break: num(e.target.value, 5) })}
          className="w-full px-2 py-1.5 rounded bg-bg-card border border-border text-[12px] text-text focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

const PomodoroIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M9 2h6" />
  </svg>
);

const definition: WidgetDefinition<PomodoroConfig> = {
  type: "pomodoro",
  title: "Pomodoro",
  icon: PomodoroIcon,
  category: "productivity",
  description: "A focus/break timer with start, pause and reset.",
  minW: 2,
  minH: 2,
  maxW: 4,
  maxH: 3,
  defaultW: 2,
  defaultH: 2,
  defaultConfig: { work: 25, break: 5 },
  Component: PomodoroComponent,
  ConfigPanel: PomodoroConfigPanel,
};

export default definition;
