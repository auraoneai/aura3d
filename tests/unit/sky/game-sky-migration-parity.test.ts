/**
 * 5.7.0 `sky.gradient` migration gate: every game moved off its hand-written sky dome onto the stylised gradient
 * must draw the same sky. The 5.6 GLSL of each dome is transcribed below (the programs were deleted with the
 * migration) and evaluated next to the engine's CPU reference (`evaluateSky`, which the GLSL/WGSL sky mirrors) over
 * a direction grid plus a fine grid around the sun. Colours are compared after sRGB encoding (within 1/255); HDR
 * values above 1 (sun discs) compare relatively (within 1/255 of the value).
 */
import { describe, expect, it } from "vitest";
import { sky } from "../../../packages/engine/src/agent-api/nodes/sky";
import { evaluateSky, skyFrame } from "../../../packages/rendering/src/atmosphere/SkyEval";
import type { AuraSkyGradientOptions } from "../../../packages/engine/src/agent-api/nodes/sky";
import { DAY_SKY_STOPS, daySkyOptions as splatDaySky } from "../../../examples/splat-rush-port/world";
import { SUN_DIR as DRIFT_SUN, daySkyOptions as driftDaySky } from "../../../examples/drift-and-deliver-port/sky";
import { LOOK as TURF_LOOK } from "../../../apps/showcase-splat-turf/src/look";
import { sunsetSkyOptions } from "../../../apps/showcase-splat-turf/src/art/haze";

type V3 = readonly [number, number, number];

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** runner-kit `hexSrgb(...).toFixed(4)` then the shader's `srgbToLinear`, as the 5.6 programs baked their stops. */
const stopColor = (hex: string): V3 => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => srgbToLinear(Number((c / 255).toFixed(4)))) as unknown as V3;
};
const normalize = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** runner-kit `gradientSkyFragment(stops)` (5.6 GLSL). */
function stopGradient(stops: readonly { t: number; hex: string }[], dir: V3): V3 {
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const t = Math.min(1, Math.max(0, 0.5 - dir[1] * 0.5));
  let c = stopColor(sorted[0]!.hex);
  for (let i = 1; i < sorted.length; i++) c = mix(c, stopColor(sorted[i]!.hex), smoothstep(sorted[i - 1]!.t, sorted[i]!.t, t));
  return c;
}

/** Splat Rush original look, `SKY_FRAGMENT` (examples/splat-rush-port/shaders.ts, 5.6). */
const splatDay56 = (dir: V3): V3 => stopGradient([
  { t: 0, hex: "#1773c0" }, { t: 0.45, hex: "#3fb0e6" }, { t: 0.75, hex: "#79cef0" }, { t: 1, hex: "#a9e0f7" }
], dir);

/** Splat Turf `sunsetSkySpec` (apps/showcase-splat-turf/src/art/haze.ts, 5.6): kit gradient + disc + halo. */
function turfSunset56(dir: V3): V3 {
  const c = stopGradient(TURF_LOOK.skyStops, dir);
  const len = Math.hypot(...TURF_LOOK.sunDir);
  const sd = normalize(TURF_LOOK.sunDir.map((v) => Number((v / len).toFixed(4))) as unknown as V3);
  const s = Math.max(dot(dir, sd), 0);
  const v = parseInt(TURF_LOOK.sunColor.slice(1), 16);
  const sun = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((ch) => Number(srgbToLinear(ch / 255).toFixed(4)));
  const k = smoothstep(0.999, 0.9994, s) * 3 + Math.pow(s, 64) * 0.6 + Math.pow(s, 8) * 0.25;
  return [c[0] + sun[0]! * k, c[1] + sun[1]! * k, c[2] + sun[2]! * k];
}

/** Drift & Deliver original look, `SKY_FRAGMENT` (examples/drift-and-deliver-port/sky.ts, 5.6). */
function driftDay56(dir: V3): V3 {
  const lin = (r: number, g: number, b: number): V3 => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  const h = Math.max(dir[1], 0);
  let col = mix(lin(0.839, 0.918, 0.973), lin(0.345, 0.627, 0.863), smoothstep(0, 0.09, h));
  col = mix(col, lin(0.114, 0.388, 0.722), smoothstep(0.08, 0.36, h));
  const s = Math.max(dot(dir, normalize(DRIFT_SUN)), 0);
  const g = 0.24 * Math.pow(s, 28) + 0.65 * Math.pow(s, 260);
  const sun = lin(1.0, 0.941, 0.831);
  return [col[0] + sun[0] * g, col[1] + sun[1] * g, col[2] + sun[2] * g];
}

/** Directions: 2 degree grid over the sphere, plus a 0.02 degree grid within 4 degrees of `focus`. */
function directions(focus?: V3): V3[] {
  const out: V3[] = [];
  const at = (el: number, az: number): V3 => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  for (let e = -89; e <= 89; e += 1) for (let a = 0; a < 360; a += 2) out.push(at((e * Math.PI) / 180, (a * Math.PI) / 180));
  if (focus) {
    const f = normalize(focus);
    const el0 = Math.asin(f[1]), az0 = Math.atan2(f[0], f[2]);
    for (let de = -4; de <= 4; de += 0.02) for (let da = -4; da <= 4; da += 0.1) out.push(at(el0 + (de * Math.PI) / 180, az0 + (da * Math.PI) / 180));
    for (let da = -4; da <= 4; da += 0.02) for (let de = -4; de <= 4; de += 0.1) out.push(at(el0 + (de * Math.PI) / 180, az0 + (da * Math.PI) / 180));
  }
  return out;
}

/** Largest difference over the grid: display-encoded below 1, relative above 1. */
function maxError(options: AuraSkyGradientOptions, reference: (dir: V3) => V3, focus?: V3): { readonly display: number; readonly hdr: number; readonly samples: number } {
  const node = sky.gradient(options).toJSON() as unknown as { spec: Record<string, unknown> };
  const frame = skyFrame(node.spec);
  expect(frame.gradient?.stylized, "migrated sky uses the stylised profile").toBeTruthy();
  let display = 0, hdr = 0;
  const dirs = directions(focus);
  for (const dir of dirs) {
    const a = reference(dir), b = evaluateSky(frame, dir);
    for (let i = 0; i < 3; i++) {
      display = Math.max(display, Math.abs(linToSrgb(Math.min(1, Math.max(0, a[i]!))) - linToSrgb(Math.min(1, Math.max(0, b[i]!)))));
      if (a[i]! > 1 || b[i]! > 1) hdr = Math.max(hdr, Math.abs(a[i]! - b[i]!) / Math.max(a[i]!, b[i]!));
    }
  }
  return { display, hdr, samples: dirs.length };
}

const ONE_CODE = 1 / 255;

describe("5.7.0 game sky migrations onto sky.gradient (CPU reference parity)", () => {
  it("splat-rush-port original look: the 4-stop day gradient", () => {
    expect(DAY_SKY_STOPS).toHaveLength(4);
    const e = maxError(splatDaySky(), splatDay56);
    console.log(`[sky-parity] splat-rush-port max display error ${(e.display * 255).toFixed(5)}/255 over ${e.samples} directions`);
    expect(e.display).toBeLessThan(ONE_CODE);
  });

  it("splat-turf: the 7-stop sunset gradient with its additive HDR disc and two-lobe halo", () => {
    const options = sunsetSkyOptions(TURF_LOOK.skyStops, TURF_LOOK.sunDir, TURF_LOOK.sunColor);
    const e = maxError(options, turfSunset56, TURF_LOOK.sunDir);
    console.log(`[sky-parity] splat-turf max display error ${(e.display * 255).toFixed(5)}/255, HDR relative ${(e.hdr * 255).toFixed(5)}/255 over ${e.samples} directions`);
    expect(e.display).toBeLessThan(ONE_CODE);
    expect(e.hdr).toBeLessThan(ONE_CODE);
  });

  it("drift-and-deliver-port original look: horizon/mid/top gradient with a two-lobe sun glow and no disc", () => {
    const e = maxError(driftDaySky(), driftDay56, DRIFT_SUN);
    console.log(`[sky-parity] drift-and-deliver-port max display error ${(e.display * 255).toFixed(5)}/255 over ${e.samples} directions`);
    expect(e.display).toBeLessThan(ONE_CODE);
  });
});
