/**
 * D3 rendered water material descriptor (PRD D3 box 3).
 *
 * NEW `WaterSurface.ts` rendered material: layered depth-tinted bands for a
 * bounded refraction look, a fresnel-weighted environment reflection tint, a
 * shore-foam mask mapped from `OceanFoamPatch` discs, and a boat-wake hook.
 *
 * Hard boundaries (do not move them into this module):
 * - NO planar reflection/refraction targets. The "refraction" here is a
 *   bounded color look only — depth-tinted bands, no render targets, no
 *   sampling of scene color. Live planar-target water lives in
 *   `OceanSurface.ts` (`WaterReflectionRefractionCapture`, B4) and is the
 *   only path `ReflectionSurfaces.ts` promotes to implemented water.
 * - Buoyancy queries stay on the fixture: use
 *   `sampleOceanFixture(...).buoyancy` for telemetry. This module implements
 *   no buoyancy physics.
 */

import { sampleOceanFixture, type OceanFixturePreset, type OceanFoamPatch } from "./OceanSurface";

export type WaterSurfacePreset = OceanFixturePreset;

export interface WaterSurfaceBoat {
  readonly x?: number;
  readonly z?: number;
  readonly headingRadians?: number;
  /** Boat speed in m/s; 0 (or omitted) disables the wake trail. */
  readonly speed?: number;
}

export interface WaterSurfaceOptions {
  readonly preset?: WaterSurfacePreset;
  readonly seed?: number;
  readonly elapsedSeconds?: number;
  readonly bandCount?: number;
  readonly boat?: WaterSurfaceBoat;
  readonly wakeSegmentCount?: number;
}

/** One opaque depth-tinted band; `depthT` 0 = shallow edge, 1 = open water. */
export interface WaterDepthBand {
  readonly depthT: number;
  readonly color: string;
  /** Fresnel-weighted sky-tint mix already baked into `color`, in [0, 1]. */
  readonly fresnelMix: number;
}

export interface WaterFoamMask {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly intensity: number;
  readonly sourcePatchId: string;
}

export interface WaterWakeSegment {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  /** 1 at the stern fading to 0 at the trail end. */
  readonly alpha: number;
}

export interface WaterSurfaceState {
  readonly preset: WaterSurfacePreset;
  readonly seed: number;
  readonly elapsedSeconds: number;
  readonly deepColor: string;
  readonly shallowColor: string;
  readonly skyTintColor: string;
  readonly bands: readonly WaterDepthBand[];
  readonly foam: readonly WaterFoamMask[];
  readonly averageFoam: number;
  readonly maxFoam: number;
  readonly wake: readonly WaterWakeSegment[];
  readonly wakeActive: boolean;
  readonly buoyancySource: string;
  readonly planarReflectionDependency: string;
  readonly claimBoundary: string;
  readonly hash: string;
}

export const WATER_SURFACE_CLAIM_BOUNDARY =
  "Layered depth-tinted water material with fresnel-weighted environment tint, " +
  "shore-foam mask, and boat-wake hook. Bounded refraction look only: no planar " +
  "reflection/refraction targets are created or sampled.";

export const WATER_SURFACE_PLANAR_DEPENDENCY =
  "B4 dependency: planar reflection/refraction targets (ReflectionSurfaces.ts " +
  "water-refraction, currently unsupported) are required before any planar water " +
  "reflection or true scene-color refraction claim. This material must not claim them.";

const presetColors: Record<WaterSurfacePreset, { readonly deep: string; readonly shallow: string; readonly sky: string }> = {
  calm: { deep: "#0b3b5e", shallow: "#2e8fb8", sky: "#9fd4ef" },
  moderate: { deep: "#0a3454", shallow: "#2a86ae", sky: "#8fc6e8" },
  rough: { deep: "#082c48", shallow: "#2578a0", sky: "#7fb2d9" },
  storm: { deep: "#061f33", shallow: "#1d5f86", sky: "#5f87a3" }
};

export function createWaterSurface(options: WaterSurfaceOptions = {}): WaterSurfaceState {
  const preset = options.preset ?? "moderate";
  if (!(preset in presetColors)) throw new RangeError(`Water surface preset must be calm|moderate|rough|storm, got "${preset}".`);
  const seed = Math.floor(options.seed ?? 0xaa7e5);
  if (!Number.isInteger(seed)) throw new RangeError("Water surface seed must be an integer.");
  const elapsedSeconds = Math.max(0, options.elapsedSeconds ?? 0);
  if (!Number.isFinite(elapsedSeconds)) throw new RangeError("Water surface elapsedSeconds must be finite.");
  const bandCount = options.bandCount ?? 5;
  if (!Number.isInteger(bandCount) || bandCount < 2 || bandCount > 12) {
    throw new RangeError("Water surface bandCount must be an integer in [2, 12].");
  }
  const wakeSegmentCount = options.wakeSegmentCount ?? 8;
  if (!Number.isInteger(wakeSegmentCount) || wakeSegmentCount < 0 || wakeSegmentCount > 32) {
    throw new RangeError("Water surface wakeSegmentCount must be an integer in [0, 32].");
  }

  const palette = presetColors[preset];
  const bands = Array.from({ length: bandCount }, (_, index): WaterDepthBand => {
    const depthT = bandCount === 1 ? 1 : index / (bandCount - 1);
    // Fresnel look: grazing angles (shallow edge, low depthT) reflect more sky.
    const fresnelMix = Number((0.12 + 0.55 * Math.pow(1 - depthT, 2.2)).toFixed(4));
    const base = mixHex(palette.shallow, palette.deep, depthT);
    return { depthT: Number(depthT.toFixed(4)), color: mixHex(base, palette.sky, fresnelMix), fresnelMix };
  });

  // Foam mask is mapped 1:1 from the deterministic fixture discs.
  const fixture = sampleOceanFixture({ preset, seed, elapsedSeconds });
  const foam: readonly WaterFoamMask[] = fixture.foamPatches.map((patch: OceanFoamPatch): WaterFoamMask => ({
    x: patch.x,
    z: patch.z,
    radius: patch.radius,
    intensity: Number(clamp(patch.intensity, 0, 1).toFixed(4)),
    sourcePatchId: patch.id
  }));

  const boat = options.boat;
  const speed = Math.max(0, boat?.speed ?? 0);
  const wakeActive = speed > 0.05 && wakeSegmentCount > 0;
  const wake = wakeActive
    ? Array.from({ length: wakeSegmentCount }, (_, index): WaterWakeSegment => {
      const t = (index + 1) / wakeSegmentCount;
      const heading = boat?.headingRadians ?? 0;
      const backX = (boat?.x ?? 0) - Math.sin(heading) * t * (1.2 + speed * 0.35);
      const backZ = (boat?.z ?? 0) - Math.cos(heading) * t * (1.2 + speed * 0.35);
      return {
        x: Number(backX.toFixed(4)),
        z: Number(backZ.toFixed(4)),
        width: Number((0.12 + t * 0.5).toFixed(4)),
        alpha: Number((Math.pow(1 - t, 1.6)).toFixed(4))
      };
    })
    : [];

  const hash = hashValues([
    bandCount, fixture.averageFoam, fixture.maxFoam, foam.length, wake.length, speed, elapsedSeconds
  ]);
  return {
    preset,
    seed,
    elapsedSeconds,
    deepColor: palette.deep,
    shallowColor: palette.shallow,
    skyTintColor: palette.sky,
    bands,
    foam,
    averageFoam: fixture.averageFoam,
    maxFoam: fixture.maxFoam,
    wake,
    wakeActive,
    buoyancySource: "sampleOceanFixture().buoyancy (fixture-side telemetry only; no buoyancy physics in this module)",
    planarReflectionDependency: WATER_SURFACE_PLANAR_DEPENDENCY,
    claimBoundary: WATER_SURFACE_CLAIM_BOUNDARY,
    hash
  };
}

function mixHex(a: string, b: string, t: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  const k = clamp(t, 0, 1);
  const toHex = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(ra[0] + (rb[0] - ra[0]) * k)}${toHex(ra[1] + (rb[1] - ra[1]) * k)}${toHex(ra[2] + (rb[2] - ra[2]) * k)}`;
}

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match?.[1]) throw new RangeError(`Water color must be a #rrggbb hex string, got "${hex}".`);
  const value = match[1];
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashValues(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const scaled = Math.round(value * 10_000);
    hash ^= scaled & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (scaled >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
