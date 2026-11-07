// Lane 514: visual helpers built on the portable `material.custom` path.
//   material.strata      height-banded rock with slope-based cliff colouring (terrain, canyons, cliffs).
//   material.caustics    lit floor with an animated, tileable water-caustic pattern (reefs, pools, harbours).
//   material.lightBeam   soft additive beam shader for an open cone (lighthouse, spot shaft).
// All three are GLSL-only custom materials: they run on WebGL2, the engine's authoritative backend. They read the
// built-in `uTime` clock only where they animate (caustics, beam); strata is static and never forces redraws.

import type { AuraColor, AuraCustomMaterialSpec, AuraCustomUniformSpec, AuraMaterialSpec } from "./types.js";
import { assertAuraCustomMaterialSpec } from "../compiler/customMaterial.js";
import { parseAuraColor } from "../../contracts/sceneGraph.js";

const rgb = (color: AuraColor): readonly [number, number, number] => {
  const [r, g, b] = parseAuraColor(color);
  return [r, g, b];
};

const num = (value: number | undefined, fallback: number, min: number, max: number, owner: string, field: string): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${owner}: ${field} must be a finite number`);
  return Math.min(max, Math.max(min, value));
};

const glslFloat = (value: number): string => {
  const text = Number.isInteger(value) ? `${value}.0` : String(Number(value.toPrecision(7)));
  return text.includes("e") ? value.toFixed(6) : text;
};
const glslVec3 = (value: readonly [number, number, number]): string => `vec3(${value.map(glslFloat).join(", ")})`;

/** Vertex stage shared by the lit helpers: world position and world normal (instanced meshes work). */
const LIT_VERTEX_GLSL = `out vec3 vVisWorld;
out vec3 vVisNormal;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vVisWorld = world.xyz;
  vVisNormal = normalMatrix * (mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/* ------------------------------------------------------------------------- */
/* material.strata                                                            */
/* ------------------------------------------------------------------------- */

export interface AuraStrataSlopeOptions {
  /** Surfaces flatter than this angle from horizontal (degrees) take `flatColor`; steeper ones show the bands. Default 38. */
  readonly angle?: number;
  /** Blend width in degrees around `angle`. Default 12. */
  readonly blend?: number;
  /** Colour of flat ground (talus, sand, grass) between cliffs. Default: the first palette colour, lightened. */
  readonly flatColor?: AuraColor;
}

export interface AuraStrataMaterialOptions {
  /** Number of layers across the height range (default 12). */
  readonly bands?: number;
  /** Palette cycled through the layers (default: five warm sandstone tones). One to eight colours. */
  readonly colors?: readonly AuraColor[];
  /** World-space height range the bands span `[bottom, top]` (default `[0, 10]`). Bands repeat outside it. */
  readonly heightRange?: readonly [number, number];
  /** Layer-edge waviness and grain, 0 to 1 (default 0.35). 0 gives ruler-straight layers. */
  readonly noise?: number;
  /** World-unit size of the noise features (default 3). */
  readonly noiseScale?: number;
  /** Thin dark seam between layers, 0 to 1 (default 0.25). */
  readonly seam?: number;
  /** Per-layer brightness variation, 0 to 1 (default 0.18). */
  readonly variation?: number;
  /** Colour flat ground separately from steep cliffs. Omit to band every surface. */
  readonly slope?: AuraStrataSlopeOptions;
  /** Surface roughness for the specular term (default 0.9). */
  readonly roughness?: number;
  /** Seed that shifts the noise (default 0). */
  readonly seed?: number;
  readonly side?: "front" | "back" | "double";
}

const STRATA_DEFAULT_COLORS: readonly AuraColor[] = ["#c0723f", "#d99a62", "#a85a34", "#e3b783", "#8e4a2e"];

function strataFragment(colors: readonly (readonly [number, number, number])[], hasSlope: boolean): string {
  const n = colors.length;
  return `#include <a3d_lights>
#include <a3d_ibl>
#include <a3d_noise>
in vec3 vVisWorld;
in vec3 vVisNormal;
out vec4 outColor;
const vec3 STRATA_PALETTE[${n}] = vec3[${n}](${colors.map(glslVec3).join(", ")});
void main() {
  vec3 N = normalize(vVisNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vVisWorld);
  vec3 p = vVisWorld;
  float scale = max(strataNoiseScale, 0.01);
  vec3 q = vec3(p.x, p.y * 0.5, p.z) / scale + strataSeed;
  float warp = (a3dFbm(q, 4) - 0.5) * 2.0;
  float grain = a3dFbm(vec3(p.x, p.y * 3.0, p.z) / (scale * 0.18) + strataSeed, 3) - 0.5;
  float span = max(strataRange.y - strataRange.x, 0.001);
  float f = (p.y - strataRange.x) / span * strataBands + warp * strataNoise * 0.9;
  float layer = floor(f);
  float within = f - layer;
  int idx = int(mod(layer, float(${n})));
  vec3 albedo = STRATA_PALETTE[idx];
  float jitter = a3dHash11(layer * 7.13 + strataSeed.x * 3.0) - 0.5;
  albedo *= 1.0 + jitter * 2.0 * strataVariation;
  float seamMask = smoothstep(0.0, 0.07, within) * (1.0 - smoothstep(0.93, 1.0, within));
  albedo *= mix(1.0, 0.55 + 0.45 * seamMask, strataSeam);
  albedo *= 1.0 + grain * strataNoise * 0.8;
${hasSlope ? `  float slopeDeg = degrees(acos(clamp(N.y, -1.0, 1.0)));
  float flatMix = 1.0 - smoothstep(strataSlope.x - strataSlope.y * 0.5, strataSlope.x + strataSlope.y * 0.5, slopeDeg);
  vec3 flatAlbedo = strataFlatColor * (1.0 + grain * strataNoise * 0.9);
  albedo = mix(albedo, flatAlbedo, flatMix);` : ""}
  albedo = max(albedo, vec3(0.0));
  vec3 color = a3dDirect(N, V, albedo, strataRoughness, vVisWorld) + albedo * a3dEnvDiffuse(N);
  outColor = vec4(color, 1.0);
}`;
}

/**
 * `material.strata(options)`: sedimentary layers by world height with noisy layer edges, thin seams and per-layer
 * brightness, lit by every scene light and the scene environment. With `slope`, flat ground reads `flatColor` and only
 * steep faces show the bands, which is how a canyon wall or heightfield cliff separates from its floor and rim.
 * Apply it to any mesh, including a `procedural.heightfield` surface.
 */
export function strataMaterial(options: AuraStrataMaterialOptions = {}): AuraMaterialSpec {
  const owner = "material.strata";
  const palette = (options.colors ?? STRATA_DEFAULT_COLORS).map(rgb);
  if (palette.length < 1 || palette.length > 8) throw new RangeError(`${owner}: colors must hold one to eight colours`);
  const bands = Math.round(num(options.bands, 12, 1, 64, owner, "bands"));
  const range = options.heightRange ?? [0, 10];
  if (!(range[1] > range[0]) || !Number.isFinite(range[0]) || !Number.isFinite(range[1])) {
    throw new RangeError(`${owner}: heightRange must be [bottom, top] with top above bottom`);
  }
  const slope = options.slope;
  const flat = slope?.flatColor !== undefined
    ? rgb(slope.flatColor)
    : ([0, 1, 2].map((i) => Math.min(1, palette[0]![i]! * 0.6 + 0.35)) as unknown as readonly [number, number, number]);
  const seed = num(options.seed, 0, -1000, 1000, owner, "seed");
  const uniforms: Record<string, AuraCustomUniformSpec> = {
    strataBands: { type: "f32", value: bands },
    strataRange: { type: "vec2", value: [range[0], range[1]] },
    strataNoise: { type: "f32", value: num(options.noise, 0.35, 0, 1, owner, "noise") },
    strataNoiseScale: { type: "f32", value: num(options.noiseScale, 3, 0.01, 1000, owner, "noiseScale") },
    strataSeam: { type: "f32", value: num(options.seam, 0.25, 0, 1, owner, "seam") },
    strataVariation: { type: "f32", value: num(options.variation, 0.18, 0, 1, owner, "variation") },
    strataRoughness: { type: "f32", value: num(options.roughness, 0.9, 0.04, 1, owner, "roughness") },
    strataSeed: { type: "vec3", value: [seed * 1.37, seed * 0.71, seed * 1.93] }
  };
  if (slope) {
    uniforms.strataSlope = { type: "vec2", value: [num(slope.angle, 38, 1, 89, owner, "slope.angle"), num(slope.blend, 12, 0.5, 80, owner, "slope.blend")] };
    uniforms.strataFlatColor = { type: "vec3", value: [...flat] };
  }
  const custom: AuraCustomMaterialSpec = {
    glsl: { vertex: LIT_VERTEX_GLSL, fragment: strataFragment(palette, slope !== undefined) },
    uniforms,
    fog: true,
    castShadow: true,
    ...(options.side === undefined ? {} : { side: options.side })
  };
  assertAuraCustomMaterialSpec(custom, owner);
  return { kind: "custom", custom };
}

/* ------------------------------------------------------------------------- */
/* material.caustics                                                          */
/* ------------------------------------------------------------------------- */

export interface AuraCausticsMaterialOptions {
  /** Colour of the floor under the light (default sand). */
  readonly color?: AuraColor;
  /** Colour of the caustic light (default warm white). */
  readonly causticColor?: AuraColor;
  /** Caustic brightness (default 1.2). */
  readonly strength?: number;
  /** World size of one caustic tile along X and Z (default 6). */
  readonly scale?: number;
  /** Animation speed multiplier (default 1). */
  readonly speed?: number;
  /** World height of the water surface. With `depthFade` the pattern dims the deeper a point lies below it (default none). */
  readonly surfaceY?: number;
  /** Extinction per metre below `surfaceY` (default 0.12; ignored without `surfaceY`). */
  readonly depthFade?: number;
  /** Roughness of the floor (default 0.95). */
  readonly roughness?: number;
  readonly side?: "front" | "back" | "double";
}

const CAUSTICS_FRAGMENT_GLSL = `#include <a3d_lights>
#include <a3d_ibl>
in vec3 vVisWorld;
in vec3 vVisNormal;
out vec4 outColor;
float visCaustic(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318530718, 6.28318530718) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
void main() {
  vec3 N = normalize(vVisNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vVisWorld);
  vec3 albedo = causticsColor;
  vec3 lit = a3dDirect(N, V, albedo, causticsRoughness, vVisWorld) + albedo * a3dEnvDiffuse(N);
  float t = uTime * causticsSpeed * 0.5 + 23.0;
  vec2 uv = vVisWorld.xz / max(causticsScale, 0.01);
  float c = visCaustic(uv, t) * 0.7 + visCaustic(uv * 1.7 + 0.31, t * 1.2) * 0.45;
  float facing = smoothstep(-0.1, 0.7, N.y);
  float depthK = causticsFade.x > 0.5 ? exp(-max(causticsFade.y - vVisWorld.y, 0.0) * causticsFade.z) : 1.0;
  vec3 caustic = causticsLight * c * causticsStrength * facing * depthK;
  outColor = vec4(lit + caustic * (albedo * 0.6 + 0.4), 1.0);
}`;

/**
 * `material.caustics(options)`: a lit floor whose surface carries moving water-caustic light, projected straight down in
 * world X/Z so every receiver (sand, rock, ruins) shows the same shimmering net. It reads `uTime`, so it animates as long
 * as the app draws frames (a scene with a `uTime` custom shader is a declared time consumer on builds that include
 * `timeConsumers`; otherwise add an `app.onFrame` hook or a looping timeline).
 */
export function causticsMaterial(options: AuraCausticsMaterialOptions = {}): AuraMaterialSpec {
  const owner = "material.caustics";
  const hasSurface = options.surfaceY !== undefined;
  const custom: AuraCustomMaterialSpec = {
    glsl: { vertex: LIT_VERTEX_GLSL, fragment: CAUSTICS_FRAGMENT_GLSL },
    uniforms: {
      causticsColor: { type: "vec3", value: [...rgb(options.color ?? "#d9c79c")] },
      causticsLight: { type: "vec3", value: [...rgb(options.causticColor ?? "#fff4d6")] },
      causticsStrength: { type: "f32", value: num(options.strength, 1.2, 0, 16, owner, "strength") },
      causticsScale: { type: "f32", value: num(options.scale, 6, 0.05, 1000, owner, "scale") },
      causticsSpeed: { type: "f32", value: num(options.speed, 1, 0, 20, owner, "speed") },
      causticsRoughness: { type: "f32", value: num(options.roughness, 0.95, 0.04, 1, owner, "roughness") },
      causticsFade: { type: "vec3", value: [hasSurface ? 1 : 0, hasSurface ? num(options.surfaceY, 0, -1e5, 1e5, owner, "surfaceY") : 0, num(options.depthFade, 0.12, 0, 4, owner, "depthFade")] }
    },
    fog: true,
    castShadow: true,
    ...(options.side === undefined ? {} : { side: options.side })
  };
  assertAuraCustomMaterialSpec(custom, owner);
  return { kind: "custom", custom };
}

/* ------------------------------------------------------------------------- */
/* material.lightBeam                                                         */
/* ------------------------------------------------------------------------- */

export interface AuraLightBeamMaterialOptions {
  /** Beam colour (default warm white). */
  readonly color?: AuraColor;
  /** Brightness multiplier (default 1.4). */
  readonly intensity?: number;
  /** Length of the cone along its axis, in object units: must match the cone's height (default 20). */
  readonly length?: number;
  /** How fast the beam fades from source to end (exponent, default 1). */
  readonly falloff?: number;
  /** Edge softness exponent: higher gives a brighter core and softer silhouette (default 1.3). */
  readonly edgeSoftness?: number;
  /** Dust noise strength, 0 to 1 (default 0.35). */
  readonly noise?: number;
  /** World-unit size of the dust features (default 2.5). */
  readonly noiseScale?: number;
  /** Noise drift speed (default 0.25). */
  readonly noiseSpeed?: number;
}

const LIGHT_BEAM_VERTEX_GLSL = `out vec3 vBeamWorld;
out vec3 vBeamNormal;
out float vBeamT;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vBeamWorld = world.xyz;
  vBeamNormal = normalMatrix * (mat3(instanceMatrix) * normal);
  vBeamT = clamp((0.5 * beamLength - position.y) / max(beamLength, 0.001), 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const LIGHT_BEAM_FRAGMENT_GLSL = `#include <a3d_noise>
in vec3 vBeamWorld;
in vec3 vBeamNormal;
in float vBeamT;
out vec4 outColor;
void main() {
  vec3 N = normalize(vBeamNormal);
  vec3 V = normalize(cameraPosition - vBeamWorld);
  float facing = clamp(abs(dot(N, V)), 0.0, 1.0);
  float edge = pow(facing, beamShape.y);
  float axial = pow(1.0 - vBeamT, beamShape.x) * smoothstep(0.0, 0.05, vBeamT);
  vec3 q = vBeamWorld / max(beamNoise.y, 0.01) - vec3(0.0, uTime * beamNoise.z, 0.0);
  float dust = a3dFbm(q, 3);
  float density = 1.0 + (dust - 0.5) * 2.0 * beamNoise.x;
  float a = clamp(edge * axial * density * beamIntensity * 0.8, 0.0, 1.0);
  outColor = vec4(beamColor * a, a);
}`;

/**
 * `material.lightBeam(options)`: additive soft beam for an open cone or cylinder whose axis is the mesh's local Y with the
 * source at +Y (`effects.volumetricBeam` builds that mesh for you). Brightness is strongest where the surface faces the
 * camera, so the silhouette dissolves instead of showing a hard cone edge; a drifting dust noise breaks up the shaft.
 */
export function lightBeamMaterial(options: AuraLightBeamMaterialOptions = {}): AuraMaterialSpec {
  const owner = "material.lightBeam";
  const custom: AuraCustomMaterialSpec = {
    glsl: { vertex: LIGHT_BEAM_VERTEX_GLSL, fragment: LIGHT_BEAM_FRAGMENT_GLSL },
    uniforms: {
      beamColor: { type: "vec3", value: [...rgb(options.color ?? "#fff1c9")] },
      beamIntensity: { type: "f32", value: num(options.intensity, 1.4, 0, 32, owner, "intensity") },
      beamLength: { type: "f32", value: num(options.length, 20, 0.01, 1e5, owner, "length") },
      beamShape: { type: "vec2", value: [num(options.falloff, 1.0, 0.05, 16, owner, "falloff"), num(options.edgeSoftness, 1.3, 0.1, 16, owner, "edgeSoftness")] },
      beamNoise: { type: "vec3", value: [num(options.noise, 0.35, 0, 1, owner, "noise"), num(options.noiseScale, 2.5, 0.01, 1000, owner, "noiseScale"), num(options.noiseSpeed, 0.25, 0, 20, owner, "noiseSpeed")] }
    },
    transparent: true,
    blending: "additive",
    depthWrite: false,
    side: "double",
    fog: false
  };
  assertAuraCustomMaterialSpec(custom, owner);
  return { kind: "custom", custom };
}
