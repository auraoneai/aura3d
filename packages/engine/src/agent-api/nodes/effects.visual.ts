// Lane 514: `effects.godRays` and `effects.volumetricBeam`.
//   godRays          screen-space radial light shafts (the existing S4 post stage) as a first-class effect, without the
//                    fog side effect of `effects.volumetricFog`.
//   volumetricBeam   a soft additive cone/cylinder shaft (lighthouse, spotlight through haze) built from
//                    `primitives.cone` + `material.lightBeam`.

import type { AuraColor, AuraEffectNode, AuraVec3 } from "./types.js";
import { AuraNodeBuilder } from "./builder.js";
import { primitives } from "./primitives.js";
import { lightBeamMaterial } from "./material.visual.js";
import { lazyNamespace } from "../lazyNamespace.js";

/** A light-like source: anything with a world `position` (point or spot light, a mesh) or a travel `direction` (a directional light). */
export interface AuraGodRaysLightSource {
  readonly position?: AuraVec3;
  /** Direction the light travels (a directional light's `direction`); the shafts point back toward the light. */
  readonly direction?: AuraVec3;
}

export interface AuraGodRaysOptions {
  readonly name?: string;
  /**
   * Where the shafts radiate from: `"sun"` (default) is the strongest directional light in the scene; a `[x, y, z]` world
   * point, a light-like `{ position }` or `{ direction }` object pins it.
   */
  readonly source?: "sun" | AuraVec3 | AuraGodRaysLightSource;
  /** Shaft gain (default 0.7). */
  readonly intensity?: number;
  /** Per-step falloff along each shaft, 0.8 to 0.99 (default 0.94); higher gives longer shafts. */
  readonly decay?: number;
  /** March samples: 32, 48 or 64 (default 48). A quality tier can only lower this. */
  readonly samples?: 32 | 48 | 64;
  /** Shaft colour (default warm white). */
  readonly color?: AuraColor;
  /** March density in (0, 1]: the fraction of the screen distance toward the light that is sampled (default 1). */
  readonly density?: number;
  /** Scattering medium per metre: shafts build with distance as `1 - exp(-medium * depth)` (default 0.18). */
  readonly medium?: number;
}

export interface AuraVolumetricBeamOptions {
  readonly name?: string;
  /** World position of the beam's source (the apex). Default `[0, 0, 0]`. */
  readonly position?: AuraVec3;
  /** Direction the beam travels from the source (default `[0, -1, 0]`). Need not be normalised. */
  readonly direction?: AuraVec3;
  /** Beam length in world units (default 20). */
  readonly length?: number;
  /** Radius of the beam where it ends (default `length * 0.12`). */
  readonly endRadius?: number;
  readonly color?: AuraColor;
  readonly intensity?: number;
  readonly falloff?: number;
  readonly edgeSoftness?: number;
  readonly noise?: number;
  readonly noiseScale?: number;
  readonly noiseSpeed?: number;
  /** Cone sides (default 48). */
  readonly radialSegments?: number;
}

const norm = (v: AuraVec3): AuraVec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (!(l > 1e-9) || !Number.isFinite(l)) throw new RangeError("effects.volumetricBeam: direction must be a non-zero finite vector");
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Shortest-arc quaternion `[x, y, z, w]` taking unit vector `a` to unit vector `b`. */
function arc(a: AuraVec3, b: AuraVec3): readonly [number, number, number, number] {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (dot < -0.999999) return [1, 0, 0, 0];
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  const w = 1 + dot;
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}

function sourceFields(source: AuraGodRaysOptions["source"]): Record<string, unknown> {
  if (source === undefined || source === "sun") return {};
  if (Array.isArray(source)) {
    if (source.length !== 3 || !source.every(Number.isFinite)) throw new RangeError("effects.godRays: source must be \"sun\", a [x, y, z] point or a light-like object");
    return { lightPosition: [...source] };
  }
  const light = source as AuraGodRaysLightSource;
  if (light.position) return { lightPosition: [...light.position] };
  if (light.direction) {
    const d = norm(light.direction);
    return { godRayDirection: [-d[0], -d[1], -d[2]] };
  }
  throw new RangeError("effects.godRays: a light-like source needs a position or a direction");
}

export const visualEffectBuilders = lazyNamespace(() => ({
  /**
   * Screen-space god rays: radial shafts march from the light toward each pixel through the scene depth and add onto the
   * HDR frame (the S4 stage, WebGL2 v2 post chain). Unlike `effects.volumetricFog` it adds no forward fog. It needs
   * the depth-aware post chain: where the renderer cannot sample depth, the stage is skipped and
   * `app.diagnostics` carries the degradation instead of failing the frame. Tier `Low` turns the stage off.
   */
  godRays: (options: AuraGodRaysOptions = {}): AuraNodeBuilder<AuraEffectNode> => {
    const decay = options.decay ?? 0.94;
    if (!Number.isFinite(decay) || decay < 0.5 || decay > 0.995) throw new RangeError("effects.godRays: decay must be in [0.5, 0.995]");
    const samples = options.samples ?? 48;
    if (samples !== 32 && samples !== 48 && samples !== 64) throw new RangeError("effects.godRays: samples must be 32, 48 or 64");
    const intensity = options.intensity ?? 0.7;
    if (!Number.isFinite(intensity) || intensity < 0) throw new RangeError("effects.godRays: intensity must be finite and non-negative");
    const node = {
      kind: "effect",
      effect: "god-rays",
      name: options.name ?? "god rays",
      intensity,
      decay,
      samples,
      color: options.color ?? "#fff1d0",
      density: options.medium ?? 0.18,
      ...sourceFields(options.source),
      ...(options.density !== undefined ? { godRayDensity: options.density } : {}),
      postAuthored: ["intensity", "decay", "samples", "color", "density", "lightPosition", "godRayDirection", "godRayDensity"]
    } as unknown as AuraEffectNode;
    return new AuraNodeBuilder<AuraEffectNode>(node);
  },
  /**
   * Soft light shaft (lighthouse beam, searchlight, window light through haze): an open cone whose silhouette dissolves
   * and whose dust noise drifts with the clock. Returns a primitive node; add it like any other node.
   */
  volumetricBeam: (options: AuraVolumetricBeamOptions = {}) => {
    const length = options.length ?? 20;
    if (!Number.isFinite(length) || length <= 0) throw new RangeError("effects.volumetricBeam: length must be positive");
    const dir = norm(options.direction ?? [0, -1, 0]);
    const apex = options.position ?? [0, 0, 0];
    const center: AuraVec3 = [apex[0] + dir[0] * length * 0.5, apex[1] + dir[1] * length * 0.5, apex[2] + dir[2] * length * 0.5];
    // The cone's apex is +Y; its local -Y axis must point along the beam direction.
    const quaternion = arc([0, -1, 0], dir);
    return primitives.cone({
      name: options.name ?? "volumetric beam",
      position: center,
      quaternion,
      params: {
        radius: options.endRadius ?? length * 0.12,
        height: length,
        radialSegments: options.radialSegments ?? 48,
        heightSegments: 12,
        openEnded: true
      },
      castShadow: false,
      receiveShadow: false,
      material: lightBeamMaterial({
        length,
        ...(options.color !== undefined ? { color: options.color } : {}),
        ...(options.intensity !== undefined ? { intensity: options.intensity } : {}),
        ...(options.falloff !== undefined ? { falloff: options.falloff } : {}),
        ...(options.edgeSoftness !== undefined ? { edgeSoftness: options.edgeSoftness } : {}),
        ...(options.noise !== undefined ? { noise: options.noise } : {}),
        ...(options.noiseScale !== undefined ? { noiseScale: options.noiseScale } : {}),
        ...(options.noiseSpeed !== undefined ? { noiseSpeed: options.noiseSpeed } : {})
      })
    });
  }
} as const));
