/**
 * A3DEnvironment uniform packer (PRD-02 §6.10/§8.1): produces the loose
 * uniform set the `a3d_prd02_lighting_ibl` chunk samples — specular cube,
 * mip count, rotation, intensities, folded `u_envSH[7]`, ambient irradiance
 * (×1/π exit radiance) and the hemisphere pair.
 *
 * `u_envSH` carries the probe's radiance sh9 with the Ramamoorthi–Hanrahan
 * cosine-lobe constants folded at upload (`convolveSH9Irradiance`), packed
 * into 7 vec4s (28 slots; last lane unused).
 */

import type { UniformValue } from "../RenderDevice.js";
import { Sampler } from "../Sampler.js";
import { TextureBinding } from "../TextureBinding.js";
import type { EnvironmentProbe } from "../contracts/environment.js";
import { convolveSH9Irradiance } from "./SphericalHarmonics.js";
import { ambientToExitRadiance } from "../LightUniforms.js";

/** Specular cube sampler: mip-mapped linear (PRD §8.1 u_envSpecular). */
const ENV_SPECULAR_SAMPLER = new Sampler({
  minFilter: "linear-mipmap-linear",
  magFilter: "linear",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge"
});

export interface A3DEnvironmentUniformInput {
  /** Bound probe; null → env terms zeroed, ambient/hemisphere still bound. */
  readonly probe: EnvironmentProbe | null;
  readonly ambient?: { readonly color: readonly [number, number, number]; readonly intensity: number };
  readonly hemisphere?: {
    readonly sky: readonly [number, number, number];
    readonly ground: readonly [number, number, number];
    readonly intensity: number;
    readonly direction?: readonly [number, number, number];
  };
  readonly rotation?: number;
  readonly diffuseIntensity?: number;
  readonly specularIntensity?: number;
}

export interface A3DEnvironmentUniforms {
  readonly uniforms: ReadonlyMap<string, UniformValue>;
  /** 1 when a real SH array was uploaded (C-28 `shBound` fact). */
  readonly shBound: 0 | 1;
}

/** Pack folded irradiance SH9 (27 floats) into u_envSH[7] (28 slots). */
export function packEnvSH(sh9: Float32Array): Float32Array {
  const folded = convolveSH9Irradiance(sh9);
  const out = new Float32Array(28);
  out.set(folded.subarray(0, 27));
  return out;
}

export function packA3DEnvironmentUniforms(input: A3DEnvironmentUniformInput): A3DEnvironmentUniforms {
  const uniforms = new Map<string, UniformValue>();
  const probe = input.probe;
  uniforms.set("u_envSpecular", new TextureBinding({
    name: "u_envSpecular",
    texture: probe?.specularCube ?? undefined,
    required: false,
    sampler: ENV_SPECULAR_SAMPLER
  }));
  uniforms.set("u_envMipCount", probe?.mipCount ?? 1);
  uniforms.set("u_envRotation", input.rotation ?? 0);
  uniforms.set("u_envDiffuseIntensity", input.diffuseIntensity ?? 1);
  uniforms.set("u_envSpecularIntensity", input.specularIntensity ?? 1);
  const shBound: 0 | 1 = probe !== null && probe.sh9.length === 27 ? 1 : 0;
  uniforms.set("u_envSH", probe !== null && probe.sh9.length === 27 ? packEnvSH(probe.sh9) : new Float32Array(28));
  const ambient = input.ambient;
  uniforms.set("u_ambientIrradiance", ambient ? ambientToExitRadiance(ambient.color, ambient.intensity) : [0, 0, 0]);
  const hemi = input.hemisphere;
  // §8.1: u_hemiSky/u_hemiGround are "pre-multiplied by intensity" (no /π).
  const hemiScale = Math.max(0, hemi?.intensity ?? 0);
  uniforms.set("u_hemiSky", hemi ? [hemi.sky[0] * hemiScale, hemi.sky[1] * hemiScale, hemi.sky[2] * hemiScale] : [0, 0, 0]);
  uniforms.set("u_hemiGround", hemi ? [hemi.ground[0] * hemiScale, hemi.ground[1] * hemiScale, hemi.ground[2] * hemiScale] : [0, 0, 0]);
  uniforms.set("u_hemiDirection", hemi?.direction ?? [0, 1, 0]);
  return { uniforms, shBound };
}
