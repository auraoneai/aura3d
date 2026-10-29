/**
 * Bunker Zero game flow: pure, DOM-free rules that main.ts wires to the page, kept here so the unit tests cover them.
 */
import { FLOORS } from "./maps";
import type { Enemy, Sim } from "./sim";

// ---------------------------------------------------------------- floor outcome (C3, C4)
export type FloorOutcome = "killhouse-clear" | "killhouse-timeup" | "floor-cleared" | "campaign-complete";

/** What a finished floor means. Kill House reads the medal: a time-out ("none") is a loss, never a clear. */
export function floorOutcome(sim: Sim, floorIdx: number): FloorOutcome {
  if (sim.state.mode === "killhouse") return sim.state.medal === "none" ? "killhouse-timeup" : "killhouse-clear";
  return floorIdx >= FLOORS.length - 1 ? "campaign-complete" : "floor-cleared";
}

export interface OutcomeView { title: string; subtitle: string; cue: "win" | "lose"; juice: "win" | null; }
export function outcomeView(outcome: FloorOutcome, sim: Sim, fmtTime: (t: number) => string): OutcomeView {
  const s = sim.state;
  switch (outcome) {
    case "killhouse-timeup": return { title: "TIME UP", subtitle: `kills ${s.kills}/${s.totalEnemies} · retrying the Kill House`, cue: "lose", juice: null };
    case "killhouse-clear": return { title: "KILL HOUSE CLEAR", subtitle: `medal: GOLD · ${fmtTime(s.floor.par - Math.max(0, s.killhouseLeft))}`, cue: "win", juice: "win" };
    case "campaign-complete": return { title: "BUNKER ZERO COMPLETE", subtitle: "the Iron Warden is down · the bunker is yours", cue: "win", juice: "win" };
    default: return { title: `${s.floor.name.toUpperCase()} — CLEARED`, subtitle: `medal: ${s.medal.toUpperCase()} · time ${fmtTime(s.time)}`, cue: "win", juice: "win" };
  }
}

// ---------------------------------------------------------------- run totals (C3, C14, C27)
export interface FloorResult { floor: number; name: string; time: number; kills: number; totalEnemies: number; secrets: number; totalSecrets: number; medal: string; score: number; }
export interface RunTotals { floors: number; time: number; kills: number; totalEnemies: number; secrets: number; totalSecrets: number; score: number; medals: Record<string, number>; }

export function floorResult(sim: Sim, floorIdx: number): FloorResult {
  const s = sim.state;
  return { floor: floorIdx + 1, name: s.floor.name, time: s.time, kills: s.kills, totalEnemies: s.totalEnemies, secrets: s.secrets, totalSecrets: s.totalSecrets, medal: s.medal, score: s.score };
}

export function runTotals(results: readonly FloorResult[]): RunTotals {
  const medals: Record<string, number> = { gold: 0, silver: 0, bronze: 0 };
  let time = 0, kills = 0, totalEnemies = 0, secrets = 0, totalSecrets = 0;
  for (const r of results) {
    time += r.time; kills += r.kills; totalEnemies += r.totalEnemies; secrets += r.secrets; totalSecrets += r.totalSecrets;
    if (r.medal in medals) medals[r.medal]!++;
  }
  // score carries across floors, so the last floor's score is the run score
  return { floors: results.length, time, kills, totalEnemies, secrets, totalSecrets, score: results.at(-1)?.score ?? 0, medals };
}

const MEDAL_RANK: Record<string, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };
/** The better of two medals (floor-card marks keep the best medal earned on each floor). */
export function betterMedal(a: string | undefined, b: string): string {
  return (MEDAL_RANK[b] ?? 0) > (MEDAL_RANK[a ?? "none"] ?? 0) ? b : (a ?? b);
}
export const MEDAL_MARK: Record<string, string> = { none: "◎", bronze: "●", silver: "●", gold: "★" };

// ---------------------------------------------------------------- scene node ids (C1)
/** Runtime node stem of an enemy: authored enemies use their spawn cell, Warden summons use the pre-built pool. */
export function enemyNodeStem(e: Pick<Enemy, "sx" | "sz" | "summonSlot">): { body: string; eye: string } {
  if (e.summonSlot !== undefined) return { body: `summon-${e.summonSlot}`, eye: `summon-eye-${e.summonSlot}` };
  return { body: `en-${e.sx}-${e.sz}`, eye: `eye-${e.sx}-${e.sz}` };
}

// ---------------------------------------------------------------- key bindings (C10, C11, C21)
export type BindAction =
  | "forward" | "back" | "strafeLeft" | "strafeRight" | "turnLeft" | "turnRight"
  | "fire" | "use" | "reload" | "map" | "pause" | "weapon1" | "weapon2" | "weapon3" | "weapon4";

/**
 * Default keys. Every key does one thing (C10): E is Use only, F is Fire only, and Q/E no longer turn (the mouse and the
 * arrow keys turn).
 */
export const DEFAULT_BINDINGS: Readonly<Record<BindAction, readonly string[]>> = Object.freeze({
  forward: ["KeyW", "ArrowUp"], back: ["KeyS", "ArrowDown"], strafeLeft: ["KeyA"], strafeRight: ["KeyD"],
  turnLeft: ["ArrowLeft"], turnRight: ["ArrowRight"],
  fire: ["Space", "KeyF", "Enter", "KeyJ"], use: ["KeyE"], reload: ["KeyR"],
  map: ["KeyM", "Tab"], pause: ["KeyP", "Escape"],
  weapon1: ["Digit1"], weapon2: ["Digit2"], weapon3: ["Digit3"], weapon4: ["Digit4"]
});
export type Bindings = Record<BindAction, string[]>;
export const REMAPPABLE: readonly BindAction[] = ["forward", "back", "strafeLeft", "strafeRight", "fire", "use", "reload", "map"];

export function cloneBindings(src: Readonly<Record<BindAction, readonly string[]>> = DEFAULT_BINDINGS): Bindings {
  return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, [...v]])) as Bindings;
}

/** Bind `code` as the primary key of `action`, taking it away from any other action so a key never does two things. */
export function rebind(b: Bindings, action: BindAction, code: string): Bindings {
  const next = cloneBindings(b);
  for (const k of Object.keys(next) as BindAction[]) next[k] = next[k].filter((c) => c !== code);
  next[action] = [code, ...next[action].slice(1)];
  return next;
}

/** Parse stored bindings; anything malformed falls back to the defaults. */
export function parseBindings(raw: string | null): Bindings {
  const out = cloneBindings();
  if (!raw) return out;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(out) as BindAction[]) {
      const v = obj[k];
      if (Array.isArray(v) && v.every((c) => typeof c === "string" && /^[A-Za-z0-9]{2,20}$/.test(c))) out[k] = [...v];
    }
  } catch { /* defaults */ }
  return out;
}

export function keyLabel(code: string | undefined): string {
  if (!code) return "—";
  const arrows: Record<string, string> = { ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT" };
  return (arrows[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "")).toUpperCase();
}

// ---------------------------------------------------------------- HUD (C25)
/** HUD cache key: whole seconds, so the DOM is written when a shown value changes, not every frame. */
export function hudKey(sim: Sim, reloading: boolean, timeShown: number): string {
  const p = sim.state.player;
  return `${Math.ceil(p.hp)}|${Math.ceil(p.armor)}|${p.mag}|${p.ammo.bullets}|${p.ammo.rockets}|${sim.state.score}|${sim.state.kills}|${sim.state.totalEnemies}|${Math.floor(timeShown)}|${p.weapon}|${reloading ? 1 : 0}|${p.key ? 1 : 0}|${p.alive ? 1 : 0}`;
}

// ---------------------------------------------------------------- cosmetic RNG (C17)
/** Render-side randomness that never touches the sim's seeded stream, so `?demo=1` replays do not depend on frame rate. */
export function cosmeticRng(seed = 0x9e3779b9): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
