/**
 * HUD model of the original HEATSINK (Time Trial): the same exponential smoothing of speed (k=9) and the four meters
 * (k=14), the same rounding and the same text formats, so the port's HUD text can be checked against the original's
 * recorded DOM values. Pure; `main.ts` writes the returned strings into the DOM.
 */
import { CFG } from "./config";
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
      takedowns: String(p.takedowns)
    };
  }
}
