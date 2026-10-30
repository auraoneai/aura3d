/**
 * GU47 AO-V1 / AO-V2: which Apex effects fire this frame, decided from read-only simulation state (never written back).
 * main.ts feeds it the previous and current frame and spawns what it returns through `app.effects.burst(kind, at)` with the
 * pack registered by src/art/vfx.ts, and paces the speed lines through `gameFeel.speedLines`.
 */
import type { ApexVfxKind } from "../art/vfx";

export interface ApexVfxFrame {
  readonly mode: string;
  readonly bolts: number;
  readonly grounded: boolean;
  /** Seconds the car has been airborne (0 while grounded). */
  readonly airSeconds: number;
  readonly rocketActive: boolean;
  /** Sky-lane rivals that passed the player closely since the run started. */
  readonly skyDodges: number;
}

export const LANDING_MIN_AIR_SECONDS = 0.25;

/** Effects to fire between two frames (at most one of each kind per frame). */
export function apexVfxEvents(prev: ApexVfxFrame | null, next: ApexVfxFrame): ApexVfxKind[] {
  if (!prev) return [];
  const out: ApexVfxKind[] = [];
  if (next.mode === "crashed" && prev.mode === "playing") out.push("apex-crash");
  if (next.mode !== "playing") return out;
  if (next.bolts > prev.bolts) out.push("apex-bolt");
  if (next.grounded && !prev.grounded && prev.airSeconds >= LANDING_MIN_AIR_SECONDS) out.push("apex-land");
  if (next.rocketActive && !prev.rocketActive) out.push("apex-rocket");
  if (next.skyDodges > prev.skyDodges) out.push("apex-skykill");
  return out;
}

/** Speed-line strength (AO-V2): above 50 m/s, or boosting, or on a rocket; never under reduced motion (0 = do not call). */
export function apexSpeedLines(speed: number, boosting: boolean, rocket: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  let amount = speed >= 50 ? 0.25 + Math.min(1, (speed - 50) / 14) * 0.35 : 0;
  if (boosting) amount = Math.max(amount, 0.55);
  if (rocket) amount = Math.max(amount, 0.85);
  return Math.min(1, Math.round(amount * 100) / 100);
}

/** A sky-lane rival passing the player: its z crossed the player's within these lateral / vertical gaps (metres). */
export const SKY_DODGE_GAP = { x: 3.6, y: 3.2 } as const;

/**
 * Count rivals that crossed the player's z since the last frame within the dodge gaps (the player survived the pass).
 * `lastDz` keeps each rival's previous signed gap by id and is updated in place.
 */
export function countSkyDodges(
  player: { x: number; y: number; z: number },
  skyCars: readonly { id?: unknown; x?: unknown; y?: unknown; z?: unknown }[],
  lastDz: Map<string, number>
): number {
  let dodges = 0;
  const seen = new Set<string>();
  for (const sc of skyCars) {
    const id = String(sc.id ?? "");
    if (!id) continue;
    seen.add(id);
    const dz = player.z - Number(sc.z ?? 0);
    const before = lastDz.get(id);
    lastDz.set(id, dz);
    if (before === undefined || player.y < 5) continue;
    if (Math.sign(before) !== Math.sign(dz) && Math.abs(player.x - Number(sc.x ?? 0)) < SKY_DODGE_GAP.x && Math.abs(player.y - Number(sc.y ?? 0)) < SKY_DODGE_GAP.y) dodges++;
  }
  for (const id of [...lastDz.keys()]) if (!seen.has(id)) lastDz.delete(id);
  return dodges;
}
