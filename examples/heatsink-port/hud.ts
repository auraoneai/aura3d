/**
 * HUD model of Ion Circuit (Time Trial): exponential smoothing of speed (k=9) and the four meters (k=14),
 * rounding and text formats verified against the recorded reference DOM values. Pure; `main.ts` writes
 * the returned strings into the DOM.
 */
import { CFG } from "./config";
import { STRIKE } from "./operation";
import type { Race } from "./race";

export const formatTime = (t: number): string => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
};

export interface CameraPoseInput {
  readonly eye: readonly [number, number, number];
  readonly look: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly fovDeg: number;
  readonly aspect: number;
}

export type ShootableKind = "sentry" | "heavy" | "barrel";

export interface TargetLockHud {
  readonly kind: ShootableKind;
  /** Unmistakable HUD callout: "SENTRY +100", "GUNSHIP +250", or "BARREL +150" */
  readonly label: string;
  /** Rounded distance ahead along the track in metres */
  readonly distanceM: number;
  /** Normalized viewport X in [0..1] (0.5 = center) */
  readonly x: number;
  /** Normalized viewport Y in [0..1] (0.5 = center) */
  readonly y: number;
  /** True when the target projects near/beyond the viewport edge */
  readonly clamped: boolean;
}

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
  /** core reactor temperature readout in °C for the AuraOne ion telemetry cluster */
  coreTemp: string;
  /** 2D projected HUD target-lock diamond/bracket reticle for the nearest live target ahead */
  targetLock: TargetLockHud | null;
}

/** "5:00" for the gold time limit */
export const GOLD_TIME_TEXT = `${Math.floor(STRIKE.goldTime / 60)}:${String(STRIKE.goldTime % 60).padStart(2, "0")}`;
export const MEDAL_TEXT = `Bronze ${STRIKE.medals.bronze} kills, silver ${STRIKE.medals.silver}, gold ${STRIKE.medals.gold} inside ${GOLD_TIME_TEXT}.`;
export const OBJECTIVE_TEXT = `STRIKE OBJECTIVE: SHOOT DRONES & RED BARRELS [CLICK / F / J] · ${STRIKE.medals.bronze} KILLS BRONZE · ${STRIKE.medals.silver} SILVER · ${STRIKE.medals.gold}+ (<${GOLD_TIME_TEXT}) GOLD`;

/** seconds the GO banner stays up after the countdown ends */
export const GO_SECONDS = 0.8;

/** the countdown banner text: 3, 2, 1, then GO for GO_SECONDS of the race, then nothing (HP-01) */
export function countText(race: Pick<Race, "state" | "countdown" | "goT">): string {
  if (race.state === "countdown") return String(Math.max(1, Math.ceil(race.countdown - 0.2)));
  return race.state === "race" && race.goT < GO_SECONDS ? "GO" : "";
}

export interface NearestTargetAhead {
  readonly kind: ShootableKind;
  readonly shortName: "SENTRY" | "GUNSHIP" | "BARREL";
  readonly label: "SENTRY +100" | "GUNSHIP +250" | "BARREL +150";
  readonly distance: number;
  readonly world: { readonly x: number; readonly y: number; readonly z: number };
}

const barrelWorldScratch = { x: 0, y: 0, z: 0 };

/**
 * Nearest live shootable target (`sentry`, `heavy` gunship, or explosive red `barrel`) ahead of the player
 * within `d >= -4 && d <= maxDistance`. Note `track.wrapDelta(p.s, t.s)` returns `p.s - t.s` (positive behind,
 * negative ahead), so `-race.track.wrapDelta(p.s, t.s)` is positive ahead of the craft.
 */
export function findNearestTargetAhead(
  race: Pick<Race, "player" | "track" | "ops" | "barrels">,
  maxDistance = 260
): NearestTargetAhead | null {
  const p = race.player;
  let bestKind: ShootableKind | null = null;
  let bestDist = Infinity;
  let bestX = 0;
  let bestY = 0;
  let bestZ = 0;

  for (const t of race.ops.targets) {
    if (!t.alive) continue;
    const d = -race.track.wrapDelta(p.s, t.s);
    if (d >= -4 && d <= maxDistance && d < bestDist) {
      bestDist = d;
      bestKind = t.kind;
      bestX = t.world.x;
      bestY = t.world.y;
      bestZ = t.world.z;
    }
  }
  for (const b of race.barrels) {
    if (!b.alive) continue;
    const d = -race.track.wrapDelta(p.s, b.s);
    if (d >= -4 && d <= maxDistance && d < bestDist) {
      bestDist = d;
      bestKind = "barrel";
      const w = race.track.toWorld(b.s, b.x, b.y + 1.4, barrelWorldScratch);
      bestX = w.x;
      bestY = w.y;
      bestZ = w.z;
    }
  }
  if (!bestKind) return null;
  const shortName = bestKind === "heavy" ? "GUNSHIP" : bestKind === "sentry" ? "SENTRY" : "BARREL";
  const label = bestKind === "heavy" ? "GUNSHIP +250" : bestKind === "sentry" ? "SENTRY +100" : "BARREL +150";
  return { kind: bestKind, shortName, label, distance: bestDist, world: { x: bestX, y: bestY, z: bestZ } };
}

function defaultCameraPose(race: Pick<Race, "player" | "track">): CameraPoseInput {
  const p = race.player;
  const fr = race.track.frame(p.s);
  const hd = Math.cos(p.theta);
  const hs = Math.sin(p.theta);
  const fx = fr.tx * hd + fr.rx * hs;
  const fz = fr.tz * hd + fr.rz * hs;
  const py = p.position.y;
  return {
    eye: [p.position.x - fx * 7.6, py + 2.0, p.position.z - fz * 7.6],
    look: [p.position.x + fx * CFG.camera.lookAhead, py + 0.8, p.position.z + fz * CFG.camera.lookAhead],
    up: [0, 1, 0],
    fovDeg: CFG.camera.fovBase,
    aspect: 16 / 9
  };
}

/** Projects the nearest live target ahead (`d >= -4 && d <= 260`) into normalized 2D HUD coordinates `[0..1]`. */
export function projectTargetLock(race: Race, cam?: CameraPoseInput): TargetLockHud | null {
  if ((race.state !== "countdown" && race.state !== "race") || race.resultsOpen || race.player.crashed) return null;
  const hit = findNearestTargetAhead(race, 260);
  if (!hit) return null;
  const pose = cam ?? defaultCameraPose(race);
  let fx = pose.look[0] - pose.eye[0];
  let fy = pose.look[1] - pose.eye[1];
  let fz = pose.look[2] - pose.eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  // right = normalize(forward x up)
  let rx = fy * pose.up[2] - fz * pose.up[1];
  let ry = fz * pose.up[0] - fx * pose.up[2];
  let rz = fx * pose.up[1] - fy * pose.up[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;

  // camUp = right x forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const dx = hit.world.x - pose.eye[0];
  const dy = hit.world.y - pose.eye[1];
  const dz = hit.world.z - pose.eye[2];
  const cz = dx * fx + dy * fy + dz * fz;
  const cx = dx * rx + dy * ry + dz * rz;
  const cy = dx * ux + dy * uy + dz * uz;

  const tanHalfY = Math.tan((Math.max(20, Math.min(130, pose.fovDeg)) * Math.PI) / 360);
  const tanHalfX = tanHalfY * Math.max(0.4, pose.aspect || 16 / 9);

  let rawX: number;
  let rawY: number;
  if (cz > 0.5) {
    rawX = 0.5 + 0.5 * (cx / (cz * tanHalfX));
    rawY = 0.5 - 0.5 * (cy / (cz * tanHalfY));
  } else {
    const dirLen = Math.hypot(cx, cy) || 1;
    rawX = 0.5 + (cx / dirLen) * 0.6;
    rawY = 0.5 - (cy / dirLen) * 0.6;
  }

  const x = Math.max(0.09, Math.min(0.91, rawX));
  const y = Math.max(0.16, Math.min(0.82, rawY));
  const clamped = Math.abs(rawX - x) > 1e-4 || Math.abs(rawY - y) > 1e-4 || cz <= 0.5;
  return {
    kind: hit.kind,
    label: hit.label,
    distanceM: Math.max(0, Math.round(hit.distance)),
    x,
    y,
    clamped
  };
}

function objectiveLine(race: Race): string {
  const o = race.ops;
  if (race.state === "countdown") return OBJECTIVE_TEXT;
  if (race.state !== "race") return "";
  const nearest = findNearestTargetAhead(race, 260);
  const next = nearest
    ? `NEXT TARGET: ${nearest.shortName} ${Math.max(0, Math.round(nearest.distance))} m [SHOOT: CLICK / F / J]`
    : "NO TARGETS AHEAD [SHOOT DRONES & BARRELS: CLICK / F / J]";
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
      gunLocked: p.gunLocked,
      coreTemp: String(Math.round(320 + Math.min(1, Math.max(0, n.heat)) * 620)),
      targetLock: projectTargetLock(race)
    };
  }
}
