/**
 * GU47 RH47-07/08: Saltwind Highway's one custom post pass per route (PRD acceptance: <= 1 shaderPass). It carries the
 * Redline heat shimmer (`heatPass.ts`) and the speed streaks (`speedPass.ts`) in one fullscreen draw before tonemapping,
 * reading colour and linear depth. Per frame the game sets `u_streak` from speed and nitro (0 on reduced motion) and
 * `u_heatTime`; the route's heat amount is fixed per scene.
 *
 * The rest of the per-route post (bloom numbers without the deprecated radius, grain on Redline, the sun flare, Halo's
 * auto-exposure) is authored from the look row in `world.ts` / `main.ts`.
 */
import { effects, type AuraAutoExposureOptions, type AuraCustomPostPass } from "@aura3d/engine";
import type { SaltwindLookRow } from "./look";
import { HEAT_SHIMMER_GLSL } from "./heatPass";
import { SPEED_STREAK_GLSL } from "./speedPass";

export const ROAD_PASS_NAME = "saltwind-road-pass";

export const ROAD_PASS_GLSL = /* glsl */ `
uniform float u_heatAmount;
uniform float u_heatStart;
uniform float u_heatTime;
uniform float u_streak;
${HEAT_SHIMMER_GLSL}
${SPEED_STREAK_GLSL}
void main() {
  vec2 uv = clamp(v_uv + rhHeatOffset(v_uv), vec2(0.0), vec2(1.0));
  vec4 c = texture(u_color, uv);
  outColor = vec4(rhSpeedStreak(uv, c.rgb), c.a);
}
`;

/** The route's custom pass (one per scene). */
export function roadPass(row: SaltwindLookRow): AuraCustomPostPass {
  return effects.shaderPass({
    name: ROAD_PASS_NAME,
    glsl: ROAD_PASS_GLSL,
    order: "before-tonemap",
    inputs: ["color", "depth"],
    uniforms: { u_heatAmount: row.post.heat.amount, u_heatStart: row.post.heat.startMetres, u_heatTime: 0, u_streak: 0 }
  });
}

/** Speed streak strength: 0 below 30 m/s, 1 at 74 m/s, +35% on nitro, capped at 1; 0 under reduced motion (PRD §6.3). */
export function streakFor(speed: number, nitro: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const base = Math.max(0, Math.min(1, (speed - 30) / 44));
  return Math.min(1, base * (nitro ? 1.35 : 1) * 0.85);
}

/** Halo's auto-exposure (S8 runs on Medium and up); the coast routes keep a fixed exposure. */
export function autoExposureFor(row: SaltwindLookRow | null): false | AuraAutoExposureOptions {
  return row?.post.autoExposure ? { minEv: -0.5, maxEv: 1.5, speedUp: 1.5, speedDown: 0.8, meteringMask: "center-weighted", compensationEv: 0.25 } : false;
}
