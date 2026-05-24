import type { EnvironmentLightingOptions, ProceduralEnvironmentMapLightingOptions } from "./ForwardPass";

export interface EnvironmentLightingCompositionOptions {
  readonly environmentMapIntensity?: number;
  readonly environmentMapSpecularIntensity?: number;
  readonly minimumEnvironmentMapIntensity?: number;
  readonly minimumEnvironmentMapSpecularIntensity?: number;
  readonly sampledReplacesProceduralMap?: boolean;
}

export function composeEnvironmentLighting(
  base: EnvironmentLightingOptions,
  sampled: EnvironmentLightingOptions,
  options: EnvironmentLightingCompositionOptions = {}
): EnvironmentLightingOptions {
  const environmentMapIntensity = resolveLightingScalar(
    options.environmentMapIntensity,
    options.minimumEnvironmentMapIntensity,
    base.environmentMapIntensity,
    sampled.environmentMapIntensity
  );
  const environmentMapSpecularIntensity = resolveLightingScalar(
    options.environmentMapSpecularIntensity,
    options.minimumEnvironmentMapSpecularIntensity,
    base.environmentMapSpecularIntensity,
    sampled.environmentMapSpecularIntensity
  );
  const environmentMapRotation = sampled.environmentMapRotation ?? base.environmentMapRotation;
  const environmentMapMipCount = sampled.environmentMapMipCount ?? base.environmentMapMipCount;
  const environmentMapEncoding = sampled.environmentMapEncoding ?? base.environmentMapEncoding;
  const proceduralMap = options.sampledReplacesProceduralMap
    ? sampled.proceduralMap
    : base.proceduralMap ?? sampled.proceduralMap;

  return {
    color: cloneColor(base.color),
    intensity: base.intensity,
    ...(proceduralMap ? { proceduralMap: cloneProceduralMap(proceduralMap) } : {}),
    ...(sampled.environmentMapTexture ?? base.environmentMapTexture
      ? { environmentMapTexture: sampled.environmentMapTexture ?? base.environmentMapTexture }
      : {}),
    ...(sampled.environmentCubeMapTexture ?? base.environmentCubeMapTexture
      ? { environmentCubeMapTexture: sampled.environmentCubeMapTexture ?? base.environmentCubeMapTexture }
      : {}),
    ...(environmentMapIntensity !== undefined ? { environmentMapIntensity } : {}),
    ...(environmentMapSpecularIntensity !== undefined ? { environmentMapSpecularIntensity } : {}),
    ...(environmentMapRotation !== undefined ? { environmentMapRotation } : {}),
    ...(environmentMapMipCount !== undefined ? { environmentMapMipCount } : {}),
    ...(environmentMapEncoding ? { environmentMapEncoding } : {}),
    ...(sampled.environmentBrdfLutTexture ?? base.environmentBrdfLutTexture
      ? { environmentBrdfLutTexture: sampled.environmentBrdfLutTexture ?? base.environmentBrdfLutTexture }
      : {})
  };
}

function resolveLightingScalar(
  explicit: number | undefined,
  minimum: number | undefined,
  base: number | undefined,
  sampled: number | undefined
): number | undefined {
  const value = explicit ?? maxFinite(base, sampled);
  if (value === undefined) return finiteOrUndefined(minimum);
  const finiteMinimum = finiteOrUndefined(minimum);
  return finiteMinimum === undefined ? value : Math.max(value, finiteMinimum);
}

function maxFinite(a: number | undefined, b: number | undefined): number | undefined {
  const finiteA = finiteOrUndefined(a);
  const finiteB = finiteOrUndefined(b);
  if (finiteA === undefined) return finiteB;
  if (finiteB === undefined) return finiteA;
  return Math.max(finiteA, finiteB);
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function cloneColor(color: readonly [number, number, number]): [number, number, number] {
  return [color[0], color[1], color[2]];
}

function cloneProceduralMap(
  map: ProceduralEnvironmentMapLightingOptions | undefined
): ProceduralEnvironmentMapLightingOptions | undefined {
  if (!map) return undefined;
  return {
    skyColor: cloneColor(map.skyColor),
    horizonColor: cloneColor(map.horizonColor),
    groundColor: cloneColor(map.groundColor),
    specularColor: cloneColor(map.specularColor),
    intensity: map.intensity,
    specularIntensity: map.specularIntensity
  };
}
