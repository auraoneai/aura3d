/**
 * HUD model of the original HEATSINK (Time Trial): the same exponential smoothing of speed (k=9) and the four meters
 * (k=14), the same rounding and the same text formats, so the port's HUD text can be checked against the original's
 * recorded DOM values. Pure; `main.ts` writes the returned strings into the DOM.
 */
import { CFG } from "./config";
import { STRIKE } from "./operation";
import type { Race } from "./race";

export const formatTime = (t: number): string => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
};

export interface HudValues {
  pos: string;
  posOf: string;
  lap: string;
  time: string;
  best: string;
  speed: string;
  pct: { ab: string; heat: string; shield: string; gun: string };
  /** CSS widths of the four meter fills, one decimal like the original */
  width: { ab: string; heat: string; shield: string; gun: string };
  heatLabel: string;
  heatActive: boolean;
  burning: boolean;
  abActive: boolean;
  shieldLow: boolean;
  hull: number;
  hullMax: number;
  takedowns: string;
  score: string;
  multiplier: string;
  targets: string;
  chain: number;
  /** the line under the HUD: the objective during the countdown, then the next target and the next medal */
  objective: string;
  medal: string;
  gunLocked: boolean;
}

/** "5:00" for the gold time limit */
export const GOLD_TIME_TEXT = `${Math.floor(STRIKE.goldTime / 60)}:${String(STRIKE.goldTime % 60).padStart(2, "0")}`;
export const MEDAL_TEXT = `Bronze ${STRIKE.medals.bronze} kills, silver ${STRIKE.medals.silver}, gold ${STRIKE.medals.gold} inside ${GOLD_TIME_TEXT}.`;
export const OBJECTIVE_TEXT = `Destroy sentry drones and shoot barrels for points. Chain kills to raise the multiplier. Finish ${CFG.track.laps} laps. ${MEDAL_TEXT}`;

/** seconds the GO banner stays up after the countdown ends */
export const GO_SECONDS = 0.8;

/** the countdown banner text: 3, 2, 1, then GO for GO_SECONDS of the race, then nothing (HP-01) */
export function countText(race: Pick<Race, "state" | "countdown" | "goT">): string {
  if (race.state === "countdown") return String(Math.max(1, Math.ceil(race.countdown - 0.2)));
  return race.state === "race" && race.goT < GO_SECONDS ? "GO" : "";
}

function objectiveLine(race: Race): string {
  const o = race.ops;
  if (race.state === "countdown") return OBJECTIVE_TEXT;
  if (race.state !== "race") return "";
  const p = race.player;
  let nearest = Infinity;
  for (const t of o.targets) {
    if (!t.alive) continue;
    const d = race.track.wrapDelta(p.s, t.s);
    if (d > 0 && d < nearest) nearest = d;
  }
  const next = nearest < Infinity ? `NEXT TARGET ${Math.round(nearest)} m` : "NO TARGETS AHEAD";
  const medal = o.nextMedal();
  const goal = medal ? `${medal.medal.toUpperCase()} AT ${medal.needed} KILLS${medal.medal === "gold" ? ` INSIDE ${GOLD_TIME_TEXT}` : ""}` : race.raceTime <= STRIKE.goldTime ? `GOLD PACE: FINISH INSIDE ${GOLD_TIME_TEXT}` : "SILVER SECURED";
  return `${next}   ·   ${goal}`;
}

export class HudModel {
  /** the original's initial smoothing state */
  readonly sm = { speed: 0, ab: 0, heat: 0, shield: 1, gun: 0 };

  update(dt: number, race: Race): HudValues {
    const p = race.player;
    const n = this.sm;
    const rawLap = Math.min(race.laps, Math.max(1, Math.floor(p.dist / race.track.length) + 1));
    const a = 1 - Math.exp(-14 * dt);
    n.speed += (p.v * 3.6 - n.speed) * (1 - Math.exp(-9 * dt));
    const targets = { ab: p.ab, heat: Math.min(1, p.heat), shield: p.shield / p.shieldMax, gun: Math.min(1, p.gunHeat) };
    for (const k of ["ab", "heat", "shield", "gun"] as const) n[k] += (targets[k] - n[k]) * a;
    const pct = (k: "ab" | "heat" | "shield" | "gun"): string => `${Math.round(Math.min(1, n[k]) * 100)}%`;
    const width = (k: "ab" | "heat" | "shield" | "gun"): string => `${(n[k] * 100).toFixed(1)}%`;
    const budget = CFG.vehicle.crashBudget + 1;
    return {
      pos: "1",
      posOf: "1",
      lap: `LAP ${rawLap}/${race.laps}`,
      time: formatTime(p.finished ? p.finishTime : race.raceTime),
      best: race.bestLap ? formatTime(race.bestLap) : "--:--.---",
      speed: String(Math.round(n.speed)),
      pct: { ab: pct("ab"), heat: pct("heat"), shield: pct("shield"), gun: pct("gun") },
      width: { ab: width("ab"), heat: width("heat"), shield: width("shield"), gun: width("gun") },
      heatLabel: p.burning > 0 ? "BURNING" : p.onLava ? "MOLTEN" : "OVERDRIVE HEAT",
      heatActive: p.rjActive,
      burning: p.burning > 0,
      abActive: p.abActive,
      shieldLow: p.shield < p.shieldMax * 0.3,
      hull: Math.max(0, budget - p.crashes),
      hullMax: budget,
      takedowns: String(p.takedowns),
      score: String(race.ops.score),
      multiplier: `x${race.ops.multiplier}`,
      targets: `${race.ops.kills}/${race.ops.totalTargets}`,
      chain: race.ops.chain,
      objective: objectiveLine(race),
      medal: race.ops.medal,
      gunLocked: p.gunLocked
    };
  }
}
