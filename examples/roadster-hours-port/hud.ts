/**
 * Saltwind Highway HUD helpers (pure, unit tested): the priority coach line ported from the original game's hint logic, the
 * nitro-window cue, best-time persistence and the change-only DOM writer.
 */
import { actAt, levelLayout } from "./course";
import { keyLabel, type Bindings, DEFAULT_BINDINGS } from "./input";
import type { Career, MedalResult, Run } from "./sim";

/**
 * The coach line: one hint at a time, highest priority first (original order): nitro window, gap crossing, ramp ahead, jump
 * line ahead, full-tank shockwave, then the act's own hint early in the act. Empty while overheated or after a missed relay
 * (the toast covers those). Key names follow the current bindings; on touch they name the buttons.
 */
export function coachLine(run: Run, touch = false, bindings: Bindings = DEFAULT_BINDINGS): string {
  if (run.overheated || run.gateMiss || run.phase !== "running") return "";
  const level = run.level;
  const thrust = touch ? "Thrust" : keyLabel(bindings.thrust[0]!);
  const nitro = touch ? "Nitro" : keyLabel(bindings.nitro[0]!);
  const act = actAt(level, run.s);
  const ramp = level.ramps.find(([a, b]) => run.s > a - 80 && run.s < b + 5);
  const gap = level.gaps.find(([a, b]) => run.s > a - 15 && run.s < b + 25);
  const lineup = levelLayout(level).lineups.find((l) => l.kicker.s > run.s - l.kicker.len && l.kicker.s - run.s < 90);
  const onJumpLine = !!lineup && run.grounded && run.s < lineup.kicker.s + lineup.kicker.len;
  let line: string;
  if (run.nitroWindow) line = `Perfect nitro · tap ${nitro} again`;
  else if (gap) line = `Hold ${thrust} to cross · release to land`;
  else if (ramp) line = `Ramp ahead · ${thrust} to launch`;
  else if (onJumpLine) line = `Jump line · ${thrust} on the ramp to clear it`;
  else if (run.thrust >= run.capacity * 0.97 && run.time > 6 && !run.nitro) line = `Nitro full · double-tap ${nitro} for a shockwave`;
  else if (run.time < 12 || run.s - act.s < 130) line = act.hint;
  else line = "";
  return touch ? touchHint(line) : rebindHint(line, bindings);
}

/** Act hints are written for the default keys; rewrite them for touch. */
function touchHint(text: string): string {
  return text
    .replace("W to accelerate · A / D to steer", "Hold Drive · Left / Right to steer")
    .replace("Correct with A / D", "Correct with Left / Right")
    .replace(/SPACE/g, "THRUST");
}
function rebindHint(text: string, b: Bindings): string {
  const up = keyLabel(b.up[0]!), left = keyLabel(b.left[0]!), right = keyLabel(b.right[0]!), thrust = keyLabel(b.thrust[0]!).toUpperCase();
  return text
    .replace("W to accelerate · A / D to steer", `${up} to accelerate · ${left} / ${right} to steer`)
    .replace("Correct with A / D", `Correct with ${left} / ${right}`)
    .replace(/SPACE/g, thrust);
}

/** The thrust bar turns green and pulses (and the label says so) while a second nitro tap would be a PERFECT NITRO. */
export function nitroLabel(run: Pick<Run, "nitro" | "nitroWindow">): string {
  if (run.nitroWindow) return "Tap now";
  if (run.nitro === 3) return "Shockwave";
  if (run.nitro === 2) return "Perfect";
  return run.nitro > 0 ? "Nitro" : "";
}

/* ------------------------------------------------------------------ arc speedo (GU47 RH47-17) */

/** The arc's full-scale speed: the top nitro speed (100 m/s). */
export const SPEEDO_MAX_KMH = 360;
/** Share of the circle the arc sweeps (270 degrees, open at the bottom); the SVG circles use `pathLength="100"`. */
export const SPEEDO_SWEEP = 75;

/** The speedo arc for a speed in km/h: the filled length in path units (0..SPEEDO_SWEEP) and whether nitro lights it red. */
export function speedoArc(kmh: number, nitro: boolean): { readonly dash: string; readonly nitro: boolean } {
  const fill = Math.max(0, Math.min(1, kmh / SPEEDO_MAX_KMH)) * SPEEDO_SWEEP;
  return { dash: `${fill.toFixed(1)} 100`, nitro };
}

/* ------------------------------------------------------------------ best times */

const RESULTS_KEY = "saltwind-highway:results";
export function loadResults(storage?: Pick<Storage, "getItem"> | null): Record<string, MedalResult> {
  try {
    const raw = storage?.getItem(RESULTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MedalResult>;
    const out: Record<string, MedalResult> = {};
    for (const [id, r] of Object.entries(parsed)) {
      if (r && typeof r.time === "number" && Number.isFinite(r.time) && typeof r.score === "number" && typeof r.medal === "string") out[id] = r;
    }
    return out;
  } catch {
    return {};
  }
}
export function saveResults(career: Pick<Career, "results">, storage?: Pick<Storage, "setItem"> | null): void {
  try { storage?.setItem(RESULTS_KEY, JSON.stringify(career.results)); } catch { /* storage full or blocked */ }
}

const fmt = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
/** "Best 0:47.10 · -1.22 s" style line for the results card; `previous` is the best before this run. */
export function bestLine(time: number, previous: MedalResult | undefined): string {
  if (!previous) return "First finish on this route";
  const delta = time - previous.time;
  if (Math.abs(delta) < 0.005) return `Matched your best ${fmt(previous.time)}`;
  return delta < 0 ? `New best · ${delta.toFixed(2)} s on ${fmt(previous.time)}` : `Best ${fmt(previous.time)} · +${delta.toFixed(2)} s`;
}

/* ------------------------------------------------------------------ DOM writes */

/** Writes text and styles only when the value changed (the HUD updates every rendered frame). */
export function createHudWriter<E extends { textContent: string | null; style: { setProperty(name: string, value: string): void } }>(lookup: (id: string) => E) {
  const text = new Map<string, string>();
  const style = new Map<string, string>();
  const els = new Map<string, E>();
  const el = (id: string): E => { let e = els.get(id); if (!e) els.set(id, e = lookup(id)); return e; };
  return {
    text(id: string, value: string): boolean {
      if (text.get(id) === value) return false;
      text.set(id, value);
      el(id).textContent = value;
      return true;
    },
    style(id: string, prop: string, value: string): boolean {
      const key = `${id}:${prop}`;
      if (style.get(key) === value) return false;
      style.set(key, value);
      el(id).style.setProperty(prop, value);
      return true;
    },
    reset(): void { text.clear(); style.clear(); }
  };
}
