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
  const positions = createRainPositions(particleCount, bounds, options.seed ?? 7);
  return {
    id,
    particleCount,
    bounds,
    velocity: [-0.35, -5.8, -0.18],
    renderItem: {
      label: id,
      geometry: Geometry.points(positions),
      material: new UnlitMaterial({
        name: "cinematic/rain-particles",
        color: [0.58, 0.74, 1, 0.58],
        pointSize: 2,
        roundPoints: false,
        renderState: { blend: true, depthWrite: false }
      }),
      includeInAutoFrame: false
    },
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `vfx:${id}`,
      feature: "vfx",
      label: "Rain particle system",
      source: "renderer-vfx",
      diagnostics: ["Rain is point geometry owned by the renderer, not a DOM/CSS overlay."]
    }),
    diagnostics: [`Compiled ${particleCount} rain particles into renderer point geometry.`]
  };
}

function createRainPositions(
  count: number,
  bounds: CinematicRainParticleSystem["bounds"],
  seed: number
): readonly (readonly [number, number, number])[] {
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const positions: [number, number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    positions.push([
      lerp(bounds.min[0], bounds.max[0], random()),
      lerp(bounds.min[1], bounds.max[1], random()),
      lerp(bounds.min[2], bounds.max[2], random())
    ]);
  }
  return positions;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
