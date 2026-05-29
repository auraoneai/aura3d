import { Geometry } from "../Geometry";
import { UnlitMaterial } from "../UnlitMaterial";
import type { RenderItem } from "../ForwardPass";
import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export interface CinematicRainParticleSystem {
  readonly id: string;
  readonly particleCount: number;
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly velocity: readonly [number, number, number];
  readonly renderItem: RenderItem;
  readonly renderItems: readonly RenderItem[];
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly diagnostics: readonly string[];
}

export function createRainParticleSystem(options: {
  readonly id?: string;
  readonly particleCount?: number;
  readonly bounds?: CinematicRainParticleSystem["bounds"];
  readonly seed?: number;
} = {}): CinematicRainParticleSystem {
  const id = options.id ?? "cinematic-rain";
  const particleCount = Math.max(32, Math.floor(options.particleCount ?? 384));
  const bounds = options.bounds ?? { min: [-4, 0.3, -5], max: [4, 5, 2] };
  const streaks = createRainStreaks(particleCount, bounds, options.seed ?? 7);
  const rainRenderItem: RenderItem = {
    label: id,
    geometry: Geometry.wideLineSegments(streaks),
    material: new UnlitMaterial({
      name: "cinematic/rain-streaks",
      color: [0.58, 0.74, 1, 0.58],
      renderState: { blend: true, depthWrite: false }
    }),
    includeInAutoFrame: false
  };
  const splashRenderItem: RenderItem = {
    label: `${id}/splash-ripples`,
    geometry: Geometry.wideLineSegments(createRainSplashRipples(Math.max(24, Math.floor(particleCount * 0.16)), bounds, (options.seed ?? 7) + 31)),
    material: new UnlitMaterial({
      name: "cinematic/rain-splash-ripples",
      color: [0.72, 0.88, 1, 0.42],
      renderState: { blend: true, depthWrite: false }
    }),
    includeInAutoFrame: false
  };
  const mistRenderItem: RenderItem = {
    label: `${id}/mist-banks`,
    geometry: Geometry.wideLineSegments(createRainMistBands(bounds)),
    material: new UnlitMaterial({
      name: "cinematic/rain-mist-banks",
      color: [0.52, 0.68, 0.82, 0.18],
      renderState: { blend: true, depthWrite: false }
    }),
    includeInAutoFrame: false
  };
  return {
    id,
    particleCount,
    bounds,
    velocity: [-0.35, -5.8, -0.18],
    renderItem: rainRenderItem,
    renderItems: [rainRenderItem, splashRenderItem, mistRenderItem],
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `vfx:${id}`,
      feature: "vfx",
      label: "Rain particle system",
      source: "renderer-vfx",
      diagnostics: ["Rain is wide streak, splash ripple, and mist geometry owned by the renderer, not a DOM/CSS overlay."]
    }),
    diagnostics: [`Compiled ${particleCount} rain streaks plus splash-ripples and mist-banks into renderer-owned wide-line geometry.`]
  };
}

function createRainStreaks(
  count: number,
  bounds: CinematicRainParticleSystem["bounds"],
  seed: number
): readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number]; readonly width: number }[] {
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const streaks: Array<{ start: [number, number, number]; end: [number, number, number]; width: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const x = lerp(bounds.min[0], bounds.max[0], random());
    const y = lerp(bounds.min[1], bounds.max[1], random());
    const z = lerp(bounds.min[2], bounds.max[2], random());
    const length = lerp(0.26, 0.82, random());
    streaks.push({
      start: [x, y, z],
      end: [x - 0.08 - random() * 0.08, Math.max(bounds.min[1], y - length), z + 0.03 + random() * 0.05],
      width: lerp(0.006, 0.018, random())
    });
  }
  return streaks;
}

function createRainSplashRipples(
  count: number,
  bounds: CinematicRainParticleSystem["bounds"],
  seed: number
): readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number]; readonly width: number }[] {
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const segments: Array<{ start: [number, number, number]; end: [number, number, number]; width: number }> = [];
  const floorY = Math.max(0.012, bounds.min[1] * 0.04);
  for (let index = 0; index < count; index += 1) {
    const x = lerp(bounds.min[0] * 0.72, bounds.max[0] * 0.72, random());
    const z = lerp(bounds.min[2] * 0.36, bounds.max[2] * 0.52, random());
    const radiusX = lerp(0.05, 0.16, random());
    const radiusZ = radiusX * lerp(0.34, 0.58, random());
    segments.push(
      { start: [x - radiusX, floorY, z], end: [x + radiusX, floorY, z], width: 0.006 },
      { start: [x, floorY, z - radiusZ], end: [x, floorY, z + radiusZ], width: 0.006 }
    );
  }
  return segments;
}

function createRainMistBands(
  bounds: CinematicRainParticleSystem["bounds"]
): readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number]; readonly width: number }[] {
  const floorY = Math.max(0.08, bounds.min[1] * 0.2);
  return [
    { start: [bounds.min[0] * 0.92, floorY + 0.06, bounds.min[2] * 0.28], end: [bounds.max[0] * 0.88, floorY + 0.06, bounds.min[2] * 0.18], width: 0.12 },
    { start: [bounds.min[0] * 0.74, floorY + 0.17, bounds.min[2] * 0.14], end: [bounds.max[0] * 0.66, floorY + 0.16, bounds.max[2] * 0.18], width: 0.16 },
    { start: [bounds.min[0] * 0.58, floorY + 0.31, bounds.max[2] * 0.24], end: [bounds.max[0] * 0.58, floorY + 0.29, bounds.max[2] * 0.34], width: 0.14 }
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
