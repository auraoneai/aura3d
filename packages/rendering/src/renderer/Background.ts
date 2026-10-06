// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/Background.ts — owner lane 02.

import type { EnvironmentBackgroundOptions } from "../EnvironmentBackgroundPass";
import type { EnvironmentLightingOptions, ForwardEnvironmentFogOptions, RenderItem } from "../ForwardPass";
import type { RenderSource } from "../contracts/renderSource";
import type { EnvironmentProbe } from "../contracts/environment";
import type { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { Sampler } from "../Sampler";
import { probeToEquirectTexture } from "../environment/probeBuild";
import { isIterable } from "./RenderShared";
import { Scene } from "@aura3d/scene";
import { rendererQrFlags } from "./FrameGraph";

/** Specular-cube background binding uses the mip chain (PRD-02 §8.7 blurriness→lod). */
const PRD02_BACKGROUND_SAMPLER = new Sampler({
  minFilter: "linear-mipmap-linear",
  magFilter: "linear",
  addressU: "clamp-to-edge",
  addressV: "clamp-to-edge"
});

/** RenderSource widening for the C-09 contributor output (contracts are lane-01). */
type RenderSourceWithProbe = RenderSource & {
  readonly environmentProbe?: EnvironmentProbe | null;
  /** Optional blur for cubemap backgrounds (0..1 → roughnessToLod). */
  readonly backgroundBlurriness?: number;
  /** Resolution intensities for the probe's IBL terms (defaults 1). */
  readonly environmentProbeDiffuseIntensity?: number;
  readonly environmentProbeSpecularIntensity?: number;
};

export function collectEnvironmentBackground(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentBackgroundOptions | undefined {
  if (source instanceof Scene || isIterable(source) || source.environmentBackground === false) return undefined;
  if (rendererQrFlags().on("A3D_QR_LIGHTING")) {
    const resolved = resolvePrd02EnvironmentBackground(source);
    if (resolved) return resolved;
  }
  return source.environmentBackground;
}

/**
 * prd02.background contributor (PRD-02 §9): the active C-09 probe supplies the
 * background — its equirect `background` texture when one exists and
 * `blurriness == 0`, otherwise the specular cube at lod = roughnessToLod(blur).
 * `environmentBackground: false` keeps the solid colour (returns undefined).
 */
export function resolvePrd02EnvironmentBackground(
  source: RenderSource
): EnvironmentBackgroundOptions | undefined {
  const probe = (source as RenderSourceWithProbe).environmentProbe;
  if (!probe) return undefined;
  const explicit = source.environmentBackground;
  const blurriness = (source as RenderSourceWithProbe).backgroundBlurriness
    ?? (typeof explicit === "object" ? explicit.blurriness : 0)
    ?? 0;
  if (probe.background && blurriness === 0) {
    return {
      projection: "equirect",
      texture: new TextureBinding({ name: "u_environmentBackgroundTexture", texture: probe.background, required: true }),
      intensity: typeof explicit === "object" ? explicit.intensity : 1,
      rotation: typeof explicit === "object" ? explicit.rotation : 0,
      inverseViewProjectionMatrix: typeof explicit === "object" ? explicit.inverseViewProjectionMatrix : undefined
    };
  }
  return {
    projection: "cubemap",
    texture: new TextureBinding({
      name: "u_environmentBackgroundCubeTexture",
      texture: probe.specularCube,
      required: true,
      sampler: PRD02_BACKGROUND_SAMPLER
    }),
    intensity: typeof explicit === "object" ? explicit.intensity : 1,
    rotation: typeof explicit === "object" ? explicit.rotation : 0,
    blurriness,
    mipCount: probe.mipCount,
    inverseViewProjectionMatrix: typeof explicit === "object" ? explicit.inverseViewProjectionMatrix : undefined
  };
}

export function collectEnvironmentLighting(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentLightingOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.environmentLighting === false) return cloneEnvironmentLighting(DISABLED_RENDERER_ENVIRONMENT_LIGHTING);
  if (source.environmentLighting) return source.environmentLighting;
  if (rendererQrFlags().on("A3D_QR_LIGHTING")) {
    const probeLighting = resolvePrd02EnvironmentLighting(source);
    if (probeLighting) return probeLighting;
  }
  return cloneEnvironmentLighting(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING);
}

/** One mipped rgba16f equirect per bound probe (WeakMap; disposed with the probe's specular cube). */
const prd02ProbeEquirects = new WeakMap<EnvironmentProbe, Texture>();

/**
 * PRD-02 Phase 3 legacy bridge: when a C-09 probe is bound, the legacy
 * environment-lighting path samples a *linear HDR* mipped equirect — no
 * Reinhard, no RGBA8 (E5 fix). The legacy procedural map is dropped.
 */
export function resolvePrd02EnvironmentLighting(source: RenderSource): EnvironmentLightingOptions | undefined {
  const probe = (source as RenderSourceWithProbe).environmentProbe;
  if (!probe) return undefined;
  let equirect = prd02ProbeEquirects.get(probe);
  if (!equirect) {
    equirect = probeToEquirectTexture(probe);
    prd02ProbeEquirects.set(probe, equirect);
  }
  const meta = source as RenderSourceWithProbe;
  const diffuse = meta.environmentProbeDiffuseIntensity ?? 1;
  const specular = meta.environmentProbeSpecularIntensity ?? 1;
  return {
    color: [1, 1, 1],
    intensity: 0,
    environmentMapTexture: new TextureBinding({
      name: "u_environmentMapTexture",
      texture: equirect,
      required: true,
      expectedColorSpace: "linear",
      sampler: new Sampler({ minFilter: "linear-mipmap-linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" })
    }),
    environmentCubeMapTexture: new TextureBinding({
      name: "u_environmentCubeMapTexture",
      texture: probe.specularCube,
      required: false,
      expectedColorSpace: "linear",
      sampler: PRD02_BACKGROUND_SAMPLER
    }),
    environmentMapIntensity: diffuse,
    environmentMapSpecularIntensity: specular,
    environmentMapMipCount: equirect.mipLevels.length,
    environmentMapEncoding: "linear"
  };
}

export function collectEnvironmentFog(source: RenderSource | Iterable<RenderItem> | Scene): ForwardEnvironmentFogOptions | false | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  return source.environmentFog;
}

function cloneEnvironmentLighting(environment: EnvironmentLightingOptions): EnvironmentLightingOptions {
  return {
    color: [...environment.color] as [number, number, number],
    intensity: environment.intensity,
    ...(environment.proceduralMap
      ? {
          proceduralMap: {
            skyColor: [...environment.proceduralMap.skyColor] as [number, number, number],
            horizonColor: [...environment.proceduralMap.horizonColor] as [number, number, number],
            groundColor: [...environment.proceduralMap.groundColor] as [number, number, number],
            specularColor: [...environment.proceduralMap.specularColor] as [number, number, number],
            intensity: environment.proceduralMap.intensity,
            specularIntensity: environment.proceduralMap.specularIntensity
          }
        }
      : {}),
    ...(environment.environmentMapTexture ? { environmentMapTexture: environment.environmentMapTexture } : {}),
    ...(environment.environmentCubeMapTexture ? { environmentCubeMapTexture: environment.environmentCubeMapTexture } : {}),
    ...(environment.environmentMapIntensity !== undefined ? { environmentMapIntensity: environment.environmentMapIntensity } : {}),
    ...(environment.environmentMapSpecularIntensity !== undefined ? { environmentMapSpecularIntensity: environment.environmentMapSpecularIntensity } : {}),
    ...(environment.environmentMapRotation !== undefined ? { environmentMapRotation: environment.environmentMapRotation } : {}),
    ...(environment.environmentMapMipCount !== undefined ? { environmentMapMipCount: environment.environmentMapMipCount } : {}),
    ...(environment.environmentMapEncoding ? { environmentMapEncoding: environment.environmentMapEncoding } : {}),
    ...(environment.environmentBrdfLutTexture ? { environmentBrdfLutTexture: environment.environmentBrdfLutTexture } : {})
  };
}

const DISABLED_RENDERER_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0, 0, 0],
  intensity: 0,
  proceduralMap: {
    skyColor: [0, 0, 0],
    horizonColor: [0, 0, 0],
    groundColor: [0, 0, 0],
    specularColor: [0, 0, 0],
    intensity: 0,
    specularIntensity: 0
  },
  environmentMapIntensity: 0,
  environmentMapSpecularIntensity: 0
};

export const DEFAULT_RENDERER_ENVIRONMENT_LIGHTING: EnvironmentLightingOptions = {
  color: [0.78, 0.8, 0.84],
  intensity: 0.42,
  proceduralMap: {
    skyColor: [0.64, 0.76, 0.94],
    horizonColor: [0.94, 0.82, 0.62],
    groundColor: [0.12, 0.13, 0.15],
    specularColor: [1, 0.94, 0.78],
    intensity: 0.5,
    specularIntensity: 0.82
  }
};
