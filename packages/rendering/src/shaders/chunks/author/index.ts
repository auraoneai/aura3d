import { A3D_FOG_GLSL } from "./fog.glsl";
import { A3D_IBL_GLSL } from "./ibl.glsl";
import { A3D_LIGHTS_GLSL } from "./lights.glsl";
import { A3D_MATH_GLSL } from "./math.glsl";
import { A3D_NOISE_GLSL } from "./noise.glsl";
import { A3D_SKY_GLSL } from "./sky.glsl";
import { A3D_SCENE_GLSL, A3D_SHADOW_GLSL } from "./shadow.glsl";
import { A3D_TOON_GLSL } from "./toon.glsl";
import { A3D_TRIPLANAR_GLSL } from "./triplanar.glsl";
import { COLORSPACE_DECODE_GLSL, COLORSPACE_ENCODE_GLSL } from "./colorspace.glsl";
import { A3D_RIM_FUNCTION_GLSL } from "../rim.glsl";

export interface A3dAuthorGlslChunk {
  /** `#include <name>` */
  readonly name: string;
  readonly source: string;
  /** Stages the chunk may be included in. Samplers and `texture()` are fragment-only. */
  readonly stages: readonly ("vertex" | "fragment")[];
  /** One-line signatures, for docs and tooling. */
  readonly provides: readonly string[];
}

/**
 * Author-facing GLSL ES 3.00 chunks for `material.custom({ glsl })`. Names are prefixed `a3d` so they never collide with
 * author helpers. None of them calls `pow`, so they compose with the automatic safe-`pow` define. A chunk may
 * `#include` another; the adapter expands each author chunk at most once per stage (GU47 E-D), so `a3d_shadow`,
 * `a3d_lights` and `a3d_ibl` can be included together and share `a3d_scene`.
 */
export const A3D_AUTHOR_GLSL_CHUNKS: readonly A3dAuthorGlslChunk[] = [
  {
    name: "a3d_math",
    source: A3D_MATH_GLSL,
    stages: ["vertex", "fragment"],
    provides: [
      "float|vec2|vec3|vec4 a3dSaturate(x)", "float a3dSq(float)", "float a3dLuma(vec3)",
      "float a3dSafeDiv(float a, float b)", "vec3 a3dSafeDiv(vec3 a, float b)", "float a3dSafeSqrt(float)",
      "float a3dSafeAcos(float)", "float a3dSafeAsin(float)", "vec2|vec3 a3dSafeNormalize(v[, fallback])",
      "float a3dRemap(x, inLo, inHi, outLo, outHi)", "float|vec3|vec4 a3dFinite(x)", "mat2 a3dRot2(float angle)"
    ]
  },
  {
    name: "a3d_noise",
    source: A3D_NOISE_GLSL,
    stages: ["vertex", "fragment"],
    provides: [
      "float a3dHash11(float)", "float a3dHash21(vec2)", "vec2 a3dHash22(vec2)", "float a3dHash31(vec3)", "vec3 a3dHash33(vec3)",
      "float a3dValueNoise(vec2|vec3)", "float a3dSimplex2(vec2)", "float a3dFbm(vec2|vec3 p, int octaves<=8)", "float a3dRidged(vec2 p, int octaves<=8)"
    ]
  },
  {
    name: "a3d_sky",
    source: A3D_SKY_GLSL,
    stages: ["vertex", "fragment"],
    provides: [
      "vec3 a3dSkyGradient(dir, horizon, zenith, ground)", "float a3dSunDisc(dir, sunDir, angularRadius)", "float a3dSunGlow(dir, sunDir, falloff)",
      "vec3 a3dHorizonHaze(dir, color, thickness)", "float a3dStars(dir, density)"
    ]
  },
  {
    name: "a3d_fog",
    source: A3D_FOG_GLSL,
    stages: ["vertex", "fragment"],
    provides: [
      "vec3 a3dFogLinear(color, fogColor, dist, near, far)", "vec3 a3dFogExp2(color, fogColor, dist, density)",
      "vec3 a3dFogHeight(color, fogColor, dist, worldY, density, heightDensity, heightBase, heightFalloff, maxFog)"
    ]
  },
  {
    name: "a3d_triplanar",
    source: A3D_TRIPLANAR_GLSL,
    stages: ["fragment"],
    provides: ["vec3 a3dTriplanarWeights(n, blendBias)", "vec4 a3dTriplanar(sampler2D tex, p, n, scale, blendBias)"]
  },
  {
    name: "a3d_toon",
    source: A3D_TOON_GLSL,
    stages: ["vertex", "fragment"],
    provides: ["float a3dToonRamp(x, steps, soft)", "float a3dToonLight(n, lightDir, steps)", "float a3dToonRim(n, viewDir, width)", "float a3dToonStep(x, edge, soft)"]
  },
  {
    name: "a3d_scene",
    source: A3D_SCENE_GLSL,
    stages: ["vertex", "fragment"],
    provides: [
      "vec3 a3dSunRadiance()", "vec3 a3dHemiLight(n)", "vec3 a3dSceneFog(color, viewDistance)",
      "uniforms u_a3dSunDirection, u_a3dSunColor, u_a3dSunIntensity, u_a3dHemiSky, u_a3dHemiGround, u_a3dFogColor, u_a3dFogDensity"
    ]
  },
  {
    name: "a3d_shadow",
    source: A3D_SHADOW_GLSL,
    stages: ["fragment"],
    provides: ["float a3dSunShadow(worldPos, normal, toLight)", "float a3dSunShadowAuto(worldPos, normal)", "vec3 a3dFragWorldPosition()"]
  },
  {
    name: "a3d_lights",
    source: A3D_LIGHTS_GLSL,
    stages: ["fragment"],
    provides: [
      "vec3 a3dDirect(N, V, albedo, roughness)", "vec3 a3dDirect(N, V, albedo, roughness, worldPos)",
      "vec3 a3dDirectLight(N, V, L, radiance, albedo, roughness)"
    ]
  },
  {
    name: "a3d_ibl",
    source: A3D_IBL_GLSL,
    stages: ["fragment"],
    provides: ["vec3 a3dEnvDiffuse(N)", "vec3 a3dEnvSpecular(R, roughness)"]
  },
  {
    name: "a3d_rim",
    source: A3D_RIM_FUNCTION_GLSL,
    stages: ["vertex", "fragment"],
    provides: ["vec3 a3dRim(n, v, color, power, intensity)"]
  },
  {
    name: "colorspace_decode",
    source: COLORSPACE_DECODE_GLSL,
    stages: ["vertex", "fragment"],
    provides: ["vec3|vec4 a3dSrgbToLinear(c)"]
  },
  {
    name: "colorspace_encode",
    source: COLORSPACE_ENCODE_GLSL,
    stages: ["vertex", "fragment"],
    provides: ["vec3|vec4 a3dLinearToSrgb(c)"]
  }
];

export const A3D_AUTHOR_GLSL_CHUNK_NAMES: readonly string[] = A3D_AUTHOR_GLSL_CHUNKS.map((chunk) => chunk.name);
