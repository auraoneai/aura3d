/**
 * IRON CROWN ambient motion (GU47 WP-15 IC47-AN2, partial): the Crown's crowd bobs in its seats and jumps on a K.O.;
 * Neo-Tokyo's neon panels stutter now and then; prayer flags flutter in the Monastery wind (see the sections below).
 *
 * The crowd is two instanced nodes (bodies and heads, `CROWD_IDS`); the bob moves each node as a whole (one transform
 * write per node per frame, no instance rewrite), so it costs no draws. A K.O. lifts the amplitude and tempo for
 * CROWD_CHEER.seconds, then it settles back. Reduced motion: the crowd holds still. Visual only.
 */
import { instances, material, primitives, type AuraColor, type AuraSceneNode } from "@aura3d/engine";
import type { StageId } from "./stages";

export const CROWD_IDS = { bodies: "ic-crowd-bodies", heads: "ic-crowd-heads" } as const;

export const CROWD_IDLE = { amplitude: 0.02, hz: 0.9 } as const;
export const CROWD_CHEER = { amplitude: 0.09, hz: 2.3, seconds: 2.6 } as const;

/**
 * Vertical offset (metres) of the crowd at `t` seconds; `koAge` is seconds since the last K.O. (Infinity when none).
 * Heads trail the bodies a little (`lag`) so the bob reads as people, not a sliding slab.
 */
export function crowdBob(t: number, koAge: number, reducedMotion: boolean, lag = 0): number {
  if (reducedMotion) return 0;
  const cheer = koAge >= 0 && koAge < CROWD_CHEER.seconds ? 1 - koAge / CROWD_CHEER.seconds : 0;
  const amplitude = CROWD_IDLE.amplitude + (CROWD_CHEER.amplitude - CROWD_IDLE.amplitude) * cheer;
  const hz = CROWD_IDLE.hz + (CROWD_CHEER.hz - CROWD_IDLE.hz) * cheer;
  // A rectified sine for the cheer (people jump up from their seats, never below them).
  const wave = Math.sin(2 * Math.PI * hz * (t - lag));
  const shape = cheer > 0 ? Math.abs(wave) * cheer + ((wave + 1) / 2) * (1 - cheer) : (wave + 1) / 2;
  return Number((amplitude * shape).toFixed(4));
}

/**
 * Neon stutter (Neo-Tokyo signs): each rect panel dips twice in 0.2 s once every few seconds (3.7 s and 5.3 s cycles,
 * offset per panel), like a failing tube. Two short dips per cycle stay far below 3 flashes a second, and the dip only
 * dims a background light; reduced motion or reduced flash holds the panel steady. Returns the intensity multiplier.
 */
export const SIGN_FLICKER = { periods: [3.7, 5.3], dips: [0.35, 0.55] } as const;

export function signFlicker(t: number, index: number, reduced: boolean): number {
  if (reduced) return 1;
  const period = SIGN_FLICKER.periods[index % SIGN_FLICKER.periods.length]!;
  const local = (((t + index * 1.3) % period) + period) % period;
  if (local < 0.06) return SIGN_FLICKER.dips[0];
  if (local >= 0.12 && local < 0.2) return SIGN_FLICKER.dips[1];
  return 1;
}

/**
 * Monastery prayer flags: two strings of lungta flags (blue, white, red, green, yellow) sag between four poles behind
 * the fight, at 2.9-3.5 m so they clear the fighters and the camera's fight band. The flags are one instanced draw
 * that bends in the E-G instance wind (default-on `A3D_QR_WORLD_WIND`); reduced motion builds them without wind.
 * Three draws in all (flags, cords, poles), no shadows cast. Visual only.
 */
export const PRAYER_FLAG_COLORS: readonly AuraColor[] = ["#2f6fd6", "#f2efe6", "#c8322b", "#2f9a55", "#e8c13a"];
export const PRAYER_FLAG_STRINGS = [
  { from: [-4.6, 3.5, -2.9], to: [-0.2, 3.3, -3.6], sag: 0.45, count: 15 },
  { from: [0.2, 3.3, -3.6], to: [4.6, 3.5, -2.9], sag: 0.45, count: 15 }
] as const;
const FLAG_SIZE = { w: 0.24, h: 0.32, d: 0.012 } as const;

type V3 = [number, number, number];

export function prayerFlagNodes(stage: StageId, reducedMotion: boolean): AuraSceneNode[] {
  if (stage !== "himalayan-monastery") return [];
  const flags: { position: V3; rotation: V3; scale: V3 }[] = [];
  const colors: AuraColor[] = [];
  const cords: { position: V3; rotation: V3; scale: V3 }[] = [];
  const poles: { position: V3; rotation: V3; scale: V3 }[] = [];
  for (const line of PRAYER_FLAG_STRINGS) {
    const [x0, y0, z0] = line.from;
    const [x1, y1, z1] = line.to;
    const yaw = -Math.atan2(z1 - z0, x1 - x0);
    const point = (u: number): V3 => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - line.sag * 4 * u * (1 - u), z0 + (z1 - z0) * u];
    for (let k = 0; k < line.count; k += 1) {
      const u = (k + 0.5) / line.count;
      const [x, y, z] = point(u);
      flags.push({ position: [x, y - FLAG_SIZE.h / 2, z], rotation: [0, yaw, 0], scale: [FLAG_SIZE.w, FLAG_SIZE.h, FLAG_SIZE.d] });
      colors.push(PRAYER_FLAG_COLORS[k % PRAYER_FLAG_COLORS.length]!);
    }
    const segments = 8;
    for (let k = 0; k < segments; k += 1) {
      const a = point(k / segments);
      const b = point((k + 1) / segments);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const pitch = Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
      cords.push({ position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotation: [0, yaw, pitch], scale: [len, 0.012, 0.012] });
    }
    for (const end of [line.from, line.to]) poles.push({ position: [end[0], end[1] / 2, end[2]], rotation: [0, 0, 0], scale: [0.07, end[1], 0.07] });
  }
  return [
    instances
      .box({
        name: "mo-prayer-flags",
        material: material.pbr({ color: "#ffffff", roughness: 0.92, metallic: 0 }),
        transforms: flags,
        colors,
        castShadow: false,
        receiveShadow: false,
        ...(reducedMotion ? {} : { wind: { strength: 0.9, gustStrength: 0.5, directionDeg: 80 } })
      })
      .toJSON(),
    primitives.box({ name: "mo-prayer-cords", material: material.pbr({ color: "#5a4a3a", roughness: 0.95, metallic: 0 }), instances: cords, castShadow: false, receiveShadow: false }).toJSON(),
    primitives.cylinder({ name: "mo-prayer-poles", material: material.pbr({ color: "#3b2c22", roughness: 0.9, metallic: 0 }), instances: poles, castShadow: false, receiveShadow: false }).toJSON()
  ];
}
