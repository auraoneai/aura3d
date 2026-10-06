// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/Background.ts — owner lane 02.

import type { EnvironmentBackgroundOptions } from "../EnvironmentBackgroundPass";
import type { EnvironmentLightingOptions, ForwardEnvironmentFogOptions, RenderItem } from "../ForwardPass";
import type { RenderSource } from "../contracts/renderSource";
import { isIterable } from "./RenderShared";
import { Scene } from "@aura3d/scene";

export function collectEnvironmentBackground(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentBackgroundOptions | undefined {
  if (source instanceof Scene || isIterable(source) || source.environmentBackground === false) return undefined;
  return source.environmentBackground;
}

export function collectEnvironmentLighting(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentLightingOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.environmentLighting === false) return cloneEnvironmentLighting(DISABLED_RENDERER_ENVIRONMENT_LIGHTING);
  if (source.environmentLighting) return source.environmentLighting;
  return cloneEnvironmentLighting(DEFAULT_RENDERER_ENVIRONMENT_LIGHTING);
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
