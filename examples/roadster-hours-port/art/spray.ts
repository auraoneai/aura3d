/**
 * GU47 RH47-12, the signature effect: crosswind salt spray. Sheets of spray lift off the sea-side cliff base and drift across
 * the asphalt with the route wind (salt on Sunbreak, sand on Redline, mist on Halo). One points draw of `SPRAY_POINTS`
 * stateless particles: each point's seed (its position attribute) picks a slot along a 160 m window of road ahead of the
 * car, a height in the route's band and a phase; the vertex stage moves it from the sea-side edge to the far side with
 * `u_time` and the wind speed, so nothing is simulated on the CPU and nothing touches the sim.
 *
 * Reduced motion halves the live count and the drift speed (PRD §6.3); Low keeps the effect at half density (the signature
 * survives every tier, PRD §6.4).
 */
import type { SprayLook } from "./look";

/** Pool size (<= 2,000 particles, WP-32 budget). */
export const SPRAY_POINTS = 1400;
/** Road window the sheets cover, metres behind / ahead of the car. */
export const SPRAY_WINDOW: readonly [number, number] = [-20, 140];

export const SPRAY_VERTEX = /* glsl */ `
out float vAlpha;
out float vLift;
float sph(float x) { return fract(sin(x * 78.233) * 43758.5453); }
void main() {
  vec3 sd = position / 20000.0 + 0.5;
  // slot along the road window and a lateral phase that advances with the wind
  float along = mix(spWindow.x, spWindow.y, sd.x);
  float span = 2.0 * spHalfWidth + 24.0;
  float rate = spWind / span * (0.75 + 0.5 * sd.y);
  float ph = fract(u_time * rate + sd.z * 13.0);
  float cyc = floor(u_time * rate + sd.z * 13.0);
  float jitter = sph(sd.x * 31.0 + cyc * 1.7);
  float lat = spSeaSign * (spHalfWidth + 12.0) - spSeaSign * ph * span;
  float h = mix(spHeight.x, spHeight.y, pow(sph(sd.y * 17.0 + cyc * 2.3), 1.6)) + sin(u_time * 1.3 + sd.x * 40.0) * 0.4;
  vec3 wp = spOrigin + spAlong * (along + (jitter - 0.5) * 6.0) + spAcross * lat + vec3(0.0, h + ph * 1.2, 0.0);
  vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  gl_Position = clip;
  float size = mix(spSize.x, spSize.y, sph(sd.z * 23.0 + cyc));
  gl_PointSize = clamp(size * projectionMatrix[1][1] * u_resolution.y * 0.5 / max(clip.w, 0.1), 1.0, 160.0);
  // alive fraction (density x amount) and a fade in from the cliff base and out on the far side
  float alive = step(sd.y, spAmount);
  vAlpha = alive * spAlpha * smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.7, 1.0, ph)) * smoothstep(spWindow.y, spWindow.y - 40.0, along);
  vLift = ph;
}`;

export const SPRAY_FRAGMENT = /* glsl */ `
in float vAlpha;
in float vLift;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y *= 1.6;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float soft = (1.0 - d) * (1.0 - d);
  outColor = vec4(spColor * (0.85 + 0.25 * vLift), vAlpha * soft);
}`;

/** Live fraction of the pool: the route density, halved on reduced motion and on Low. */
export function sprayAmount(spray: SprayLook, options: { readonly reducedMotion?: boolean; readonly low?: boolean } = {}): number {
  let amount = spray.density;
  if (options.reducedMotion) amount *= 0.5;
  if (options.low) amount *= 0.5;
  return Math.max(0, Math.min(1, amount));
}

/** Drift speed across the road (m/s): the route wind, halved on reduced motion. */
export const sprayWind = (spray: SprayLook, reducedMotion = false): number => spray.windSpeed * (reducedMotion ? 0.5 : 1);

/**
 * Lateral position of a particle at phase `ph` relative to the road centre (metres, +l right of travel): the CPU mirror of
 * the vertex stage, so the unit test can prove the sheet crosses the road (RH47-12 "centroid moves laterally").
 */
export function sprayLateral(seaSign: number, halfWidth: number, ph: number): number {
  const span = 2 * halfWidth + 24;
  return seaSign * (halfWidth + 12) - seaSign * ph * span;
}
