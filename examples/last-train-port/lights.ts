/**
 * GU47 WP-31 LT-02 / LT-03: the Lamplight Line's real lamplight. The C-35 art direction caps a racing game at one shadowed
 * key and six other lights, so the practicals are a pool that travels with the tram instead of 26 fixed nodes:
 *
 * - `bounce`: one hemisphere light per band (sky over the lit cloud sea, LT-03);
 * - `platform-light-0..3`: four warm points on the platform of the town the tram is at (docked) or nearest to (en route; they
 *   jump to the next town at the leg's midpoint, where neither platform is in the chase camera's view);
 * - `headlamp`: one spot ahead of the tram, moved with it every frame.
 *
 * The pool is mounted only in bands C, D and E (A/B have no practical light). Positions are pure functions of the route, so
 * the test pins them; `world.ts` moves the nodes with `setLight` (E-B) and falls back to `setPosition`.
 */
import { sampleRoute, type SimData } from "./sim";
import type { V3 } from "./orient";

export const PLATFORM_LIGHTS = 4;
/** Non-key lights the art direction declares: bounce + 4 platform points + headlamp. */
export const PRACTICAL_COUNT = 1 + PLATFORM_LIGHTS + 1;
export const PLATFORM_LIGHT_IDS = Array.from({ length: PLATFORM_LIGHTS }, (_, i) => `platform-light-${i}`);
export const HEADLAMP_ID = "headlamp";
export const BOUNCE_ID = "bounce";
/** Lamplight amber (identity accent) and the tram headlamp's warmer white. */
export const PLATFORM_LIGHT_COLOR = "#ffc77a";
export const HEADLAMP_COLOR = "#ffe6b8";
export const PLATFORM_LIGHT_RANGE = 16;

/** Town platform frame: origin on the track at the stop, forward along the track, side toward the platform. */
function townFrame(data: SimData, town: number): { o: V3; f: V3; s: V3 } {
  const s0 = sampleRoute(data.route, town, 0), s1 = sampleRoute(data.route, town, 6);
  let fx = s1.x - s0.x, fz = s1.z - s0.z;
  const l = Math.hypot(fx, fz) || 1;
  fx /= l; fz /= l;
  return { o: [s0.x, s0.y, s0.z], f: [fx, 0, fz], s: [fz, 0, -fx] };
}

/**
 * The four platform light positions at `town`: under the two lamp heads (lateral 6.8, along -9 / +9, as world.ts places the
 * lamp posts) and two under the canopy (lateral 5.2, along -5 / +5), all 4.2 m above the track.
 */
export function platformLightPositions(data: SimData, town: number): V3[] {
  const { o, f, s } = townFrame(data, town);
  const at = (lat: number, along: number, up: number): V3 => [o[0] + s[0] * lat + f[0] * along, o[1] + up, o[2] + s[2] * lat + f[2] * along];
  return [at(6.8, -9, 4.1), at(6.8, 9, 4.1), at(5.2, -5, 4.3), at(5.2, 5, 4.3)];
}

/** Which town's platform the pool lights: the docked town, else the nearer end of the current leg. */
export function poolTown(data: SimData, leg: number, distance: number, phase: string): number {
  const n = data.tables.towns.length;
  if (phase !== "enroute") return ((leg % n) + n) % n;
  const len = data.route.legs[leg]?.length ?? 1;
  return distance / len < 0.5 ? leg : (leg + 1) % n;
}

/** Headlamp pose from the tram's pose point and unit forward: 5.2 m ahead, 1.4 m up, aimed 30 m down the track and 2 m lower. */
export function headlampPose(here: { x: number; y: number; z: number }, f: V3): { position: V3; target: V3; direction: V3 } {
  const position: V3 = [here.x + f[0] * 5.2, here.y + 1.4 + f[1] * 5.2, here.z + f[2] * 5.2];
  const target: V3 = [here.x + f[0] * 35, here.y - 0.6 + f[1] * 35, here.z + f[2] * 35];
  const d: V3 = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  const l = Math.hypot(...d) || 1;
  return { position, target, direction: [d[0] / l, d[1] / l, d[2] / l] };
}

/** GU47 LT-08: one box reflection probe per station, updated once (128 px; 6 probes x 6 faces x 128^2 RGBA16F with mips ~ 6.3 MB). */
export const STATION_PROBE_RESOLUTION = 128;
export interface StationProbe { readonly name: string; readonly position: V3; readonly box: { readonly min: V3; readonly max: V3 } }

/** The world AABB of each platform (track to the canopy, 16 m either side of the stop, deck to roof) and its centre. */
export function stationProbes(data: SimData): StationProbe[] {
  return data.tables.towns.map((_, town) => {
    const { o, f, s } = townFrame(data, town);
    const corners: V3[] = [];
    for (const lat of [-1, 9]) for (const along of [-16, 16]) for (const up of [-0.5, 8]) corners.push([o[0] + s[0] * lat + f[0] * along, o[1] + up, o[2] + s[2] * lat + f[2] * along]);
    const min = [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]!))) as unknown as V3;
    const max = [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]!))) as unknown as V3;
    return { name: `station-probe-${town}`, position: [o[0] + s[0] * 4, o[1] + 2.4, o[2] + s[2] * 4], box: { min, max } };
  });
}
