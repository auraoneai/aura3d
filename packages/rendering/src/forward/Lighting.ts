// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from ForwardPass.ts; 0 changed logic lines.

import type { ForwardPointShadowMapOptions, ForwardShadowMapOptions } from "../ForwardPass.js";
import { MAX_FORWARD_SHADOW_PCF_SAMPLES, identityMatrix, isFiniteArrayLike, toMat4Uniform } from "../ForwardPass.js";
import { createClusteredForwardLighting, type ClusteredForwardLightingResources } from "../ClusteredForwardLighting.js";
import { MAX_DIRECT_LIGHTS, recordAuraLightsCounters } from "../LightUniforms.js";
import type { CollectedLight } from "../LightCollector.js";
import { RenderDeviceError, type RenderShaderProgram, type UniformValue } from "../RenderDevice.js";
import { createShadowFilterKernel, type ShadowFilterKernel } from "../ShadowMap.js";
import { TextureBinding } from "../TextureBinding.js";
import type { RenderItem } from "../contracts/renderItem.js";
import type { ForwardSpotShadowMapOptions } from "../shadows/SpotShadowMaps.js";
import { rendererQrFlags } from "../renderer/FrameGraph.js";

/** PRD-02 §6.3: flag-on default is full-strength shadowing (1.0), not 0.65. */
export function prd02ShadowStrengthDefault(): number {
  return rendererQrFlags().on("A3D_QR_LIGHTING") ? 1 : 0.65;
}

/** C-11 `receiveShadow`: flag-on honours `item.receiveShadow === false`. */
function receiveShadowDisabled(item: RenderItem): boolean {
  return rendererQrFlags().on("A3D_QR_LIGHTING") && item.receiveShadow === false;
}

export function selectForwardShadowMap(
  shadowMap: ForwardShadowMapOptions | undefined,
  item: RenderItem,
  cameraViewMatrix?: Float32Array | readonly number[],
  cameraPosition?: readonly [number, number, number]
): ForwardShadowMapOptions | undefined {
  const cascades = shadowMap?.cascades;
  if (!shadowMap || !cascades || cascades.length === 0) return shadowMap;
  const center = renderItemWorldCenter(item);
  const depth = cameraViewMatrix && cameraViewMatrix.length >= 16
    ? Math.max(0, -(
        cameraViewMatrix[2]! * center[0]
        + cameraViewMatrix[6]! * center[1]
        + cameraViewMatrix[10]! * center[2]
        + cameraViewMatrix[14]!
      ))
    : cameraPosition
      ? Math.hypot(center[0] - cameraPosition[0], center[1] - cameraPosition[1], center[2] - cameraPosition[2])
      : cascades[0]!.near;
  const selected = cascades.find((cascade) => depth <= cascade.far) ?? cascades[cascades.length - 1]!;
  return selected.shadowMap;
}

export function applyForwardShadowMapUniforms(
  shadowMap: ForwardShadowMapOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const requiredUniforms = [
    "u_shadowMapTexture",
    "u_shadowMapEnabled",
    "u_shadowMapMatrix",
    "u_shadowMapStrength",
    "u_shadowMapBias",
    "u_shadowMapSlopeBias",
    "u_shadowMapTexelSize",
    "u_shadowPcfSampleCount",
    "u_shadowPcfSamples"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  applyForwardPointShadowMapUniforms(shadowMap?.pointLight, item, shader, uniforms);
  applyForwardSpotShadowMapUniforms(shadowMap?.spotLight, item, shader, uniforms);
  if (!shadowMap) {
    uniforms.set("u_shadowMapTexture", new TextureBinding({ name: "u_shadowMapTexture", required: false }));
    uniforms.set("u_shadowMapEnabled", 0);
    uniforms.set("u_shadowMapMatrix", new Float32Array(identityMatrix()));
    uniforms.set("u_shadowMapStrength", 0);
    uniforms.set("u_shadowMapBias", 0);
    uniforms.set("u_shadowMapSlopeBias", 0);
    uniforms.set("u_shadowMapTexelSize", [1, 1]);
    uniforms.set("u_shadowPcfSampleCount", 1);
    uniforms.set("u_shadowPcfSamples", new Float32Array(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4));
    return;
  }
  const validation = shadowMap.texture.validate();
  if (!validation.ok) {
    throw new RenderDeviceError("Forward shadow-map texture binding validation failed", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      diagnostics: validation.diagnostics
    });
  }
  const strength = shadowMap.strength ?? prd02ShadowStrengthDefault();
  const bias = shadowMap.bias ?? 0.001;
  const slopeBias = shadowMap.slopeBias ?? 1;
  const texelSize = shadowMap.texelSize ?? [
    1 / Math.max(1, shadowMap.texture.texture?.width ?? 1),
    1 / Math.max(1, shadowMap.texture.texture?.height ?? 1)
  ];
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RenderDeviceError("Forward shadow-map strength must be finite in [0, 1]", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      strength
    });
  }
  if (!Number.isFinite(bias) || bias < 0) {
    throw new RenderDeviceError("Forward shadow-map bias must be finite and non-negative", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      bias
    });
  }
  if (!Number.isFinite(slopeBias) || slopeBias < 0) {
    throw new RenderDeviceError("Forward shadow-map slopeBias must be finite and non-negative", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      slopeBias
    });
  }
  if (texelSize.length !== 2 || !texelSize.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RenderDeviceError("Forward shadow-map texelSize must contain two finite positive values", "FORWARD_SHADOW_MAP_CONTRACT", {
      label: item.label,
      texelSize: Array.from(texelSize)
    });
  }
  const filterKernel = shadowMap.filterKernel ?? DEFAULT_FORWARD_SHADOW_FILTER_KERNEL;
  const pcfSamples = packForwardShadowPcfSamples(filterKernel, item.label);
  const shadowed = !receiveShadowDisabled(item);
  uniforms.set("u_shadowMapTexture", shadowMap.texture);
  uniforms.set("u_shadowMapEnabled", shadowed ? 1 : 0);
  uniforms.set("u_shadowMapMatrix", toMat4Uniform(shadowMap.lightMatrix, "shadowMap.lightMatrix", item.label));
  uniforms.set("u_shadowMapStrength", shadowed ? strength : 0);
  uniforms.set("u_shadowMapBias", bias);
  uniforms.set("u_shadowMapSlopeBias", slopeBias);
  uniforms.set("u_shadowMapTexelSize", texelSize);
  uniforms.set("u_shadowPcfSampleCount", filterKernel.samples.length);
  uniforms.set("u_shadowPcfSamples", pcfSamples);
}

export function applyForwardPointShadowMapUniforms(
  pointShadowMap: ForwardPointShadowMapOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const requiredUniforms = [
    "u_pointShadowMapTexture",
    "u_pointShadowMapEnabled",
    "u_pointShadowLightPosition",
    "u_pointShadowRange",
    "u_pointShadowFaceMatrices",
    "u_pointShadowFaceRects",
    "u_pointShadowStrength",
    "u_pointShadowBias",
    "u_pointShadowSlopeBias",
    "u_pointShadowTexelSize",
    "u_pointShadowPcfSampleCount",
    "u_pointShadowPcfSamples"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  if (!pointShadowMap) {
    uniforms.set("u_pointShadowMapTexture", new TextureBinding({ name: "u_pointShadowMapTexture", required: false }));
    uniforms.set("u_pointShadowMapEnabled", 0);
    uniforms.set("u_pointShadowLightPosition", [0, 0, 0]);
    uniforms.set("u_pointShadowRange", 1);
    uniforms.set("u_pointShadowFaceMatrices", new Float32Array(6 * 16));
    uniforms.set("u_pointShadowFaceRects", new Float32Array(6 * 4));
    uniforms.set("u_pointShadowStrength", 0);
    uniforms.set("u_pointShadowBias", 0);
    uniforms.set("u_pointShadowSlopeBias", 0);
    uniforms.set("u_pointShadowTexelSize", [1, 1]);
    uniforms.set("u_pointShadowPcfSampleCount", 1);
    uniforms.set("u_pointShadowPcfSamples", new Float32Array(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4));
    return;
  }
  const validation = pointShadowMap.texture.validate();
  if (!validation.ok) {
    throw new RenderDeviceError("Forward point-shadow atlas texture binding validation failed", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      diagnostics: validation.diagnostics
    });
  }
  if (pointShadowMap.lightPosition.length !== 3 || !isFiniteArrayLike(pointShadowMap.lightPosition)) {
    throw new RenderDeviceError("Forward point-shadow lightPosition must contain three finite values", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      lightPosition: pointShadowMap.lightPosition
    });
  }
  if (!Number.isFinite(pointShadowMap.range) || pointShadowMap.range <= 0) {
    throw new RenderDeviceError("Forward point-shadow range must be finite and positive", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      range: pointShadowMap.range
    });
  }
  const faceMatrices = toFloat32Array(pointShadowMap.faceMatrices, 6 * 16, "pointShadowMap.faceMatrices", item.label);
  const faceRects = toFloat32Array(pointShadowMap.faceRects, 6 * 4, "pointShadowMap.faceRects", item.label);
  validatePointShadowFaceRects(faceRects, item.label);
  const strength = pointShadowMap.strength ?? prd02ShadowStrengthDefault();
  const bias = pointShadowMap.bias ?? 0.001;
  const slopeBias = pointShadowMap.slopeBias ?? 1;
  const texelSize = pointShadowMap.texelSize ?? [
    1 / Math.max(1, pointShadowMap.texture.texture?.width ?? 1),
    1 / Math.max(1, pointShadowMap.texture.texture?.height ?? 1)
  ];
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RenderDeviceError("Forward point-shadow strength must be finite in [0, 1]", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      strength
    });
  }
  if (!Number.isFinite(bias) || bias < 0) {
    throw new RenderDeviceError("Forward point-shadow bias must be finite and non-negative", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      bias
    });
  }
  if (!Number.isFinite(slopeBias) || slopeBias < 0) {
    throw new RenderDeviceError("Forward point-shadow slopeBias must be finite and non-negative", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      slopeBias
    });
  }
  if (texelSize.length !== 2 || !texelSize.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RenderDeviceError("Forward point-shadow texelSize must contain two finite positive values", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      texelSize: Array.from(texelSize)
    });
  }
  const filterKernel = pointShadowMap.filterKernel ?? DEFAULT_FORWARD_SHADOW_FILTER_KERNEL;
  const pointShadowed = !receiveShadowDisabled(item);
  uniforms.set("u_pointShadowMapTexture", pointShadowMap.texture);
  uniforms.set("u_pointShadowMapEnabled", pointShadowed ? 1 : 0);
  uniforms.set("u_pointShadowLightPosition", pointShadowMap.lightPosition);
  uniforms.set("u_pointShadowRange", pointShadowMap.range);
  uniforms.set("u_pointShadowFaceMatrices", faceMatrices);
  uniforms.set("u_pointShadowFaceRects", faceRects);
  uniforms.set("u_pointShadowStrength", pointShadowed ? strength : 0);
  uniforms.set("u_pointShadowBias", bias);
  uniforms.set("u_pointShadowSlopeBias", slopeBias);
  uniforms.set("u_pointShadowTexelSize", texelSize);
  uniforms.set("u_pointShadowPcfSampleCount", filterKernel.samples.length);
  uniforms.set("u_pointShadowPcfSamples", packForwardShadowPcfSamples(filterKernel, item.label));
}

export function applyForwardSpotShadowMapUniforms(
  spotShadowMap: ForwardSpotShadowMapOptions | undefined,
  item: RenderItem,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const requiredUniforms = [
    "u_spotShadowMapTexture",
    "u_spotShadowMapEnabled",
    "u_spotShadowLightPosition",
    "u_spotShadowLightDirection",
    "u_spotShadowMatrix",
    "u_spotShadowCone",
    "u_spotShadowRange",
    "u_spotShadowStrength",
    "u_spotShadowBias",
    "u_spotShadowSlopeBias",
    "u_spotShadowTexelSize",
    "u_spotShadowPcfSampleCount",
    "u_spotShadowPcfSamples"
  ];
  if (!requiredUniforms.every((uniform) => shader.reflection.uniforms.has(uniform))) {
    return;
  }
  if (!spotShadowMap) {
    uniforms.set("u_spotShadowMapTexture", new TextureBinding({ name: "u_spotShadowMapTexture", required: false }));
    uniforms.set("u_spotShadowMapEnabled", 0);
    uniforms.set("u_spotShadowLightPosition", [0, 0, 0]);
    uniforms.set("u_spotShadowLightDirection", [0, -1, 0]);
    uniforms.set("u_spotShadowMatrix", new Float32Array(identityMatrix()));
    uniforms.set("u_spotShadowCone", [Math.PI / 4, 0]);
    uniforms.set("u_spotShadowRange", 1);
    uniforms.set("u_spotShadowStrength", 0);
    uniforms.set("u_spotShadowBias", 0);
    uniforms.set("u_spotShadowSlopeBias", 0);
    uniforms.set("u_spotShadowTexelSize", [1, 1]);
    uniforms.set("u_spotShadowPcfSampleCount", 1);
    uniforms.set("u_spotShadowPcfSamples", new Float32Array(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4));
    return;
  }
  const validation = spotShadowMap.texture.validate();
  if (!validation.ok) {
    throw new RenderDeviceError("Forward spot-shadow texture binding validation failed", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      diagnostics: validation.diagnostics
    });
  }
  if (spotShadowMap.lightPosition.length !== 3 || !isFiniteArrayLike(spotShadowMap.lightPosition)) {
    throw new RenderDeviceError("Forward spot-shadow lightPosition must contain three finite values", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      lightPosition: spotShadowMap.lightPosition
    });
  }
  if (spotShadowMap.lightDirection.length !== 3 || !isFiniteArrayLike(spotShadowMap.lightDirection)) {
    throw new RenderDeviceError("Forward spot-shadow lightDirection must contain three finite values", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      lightDirection: spotShadowMap.lightDirection
    });
  }
  if (!Number.isFinite(spotShadowMap.angle) || spotShadowMap.angle <= 0 || spotShadowMap.angle >= Math.PI / 2) {
    throw new RenderDeviceError("Forward spot-shadow angle must be within (0, PI / 2)", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      angle: spotShadowMap.angle
    });
  }
  if (spotShadowMap.penumbra !== undefined && (!Number.isFinite(spotShadowMap.penumbra) || spotShadowMap.penumbra < 0 || spotShadowMap.penumbra > 1)) {
    throw new RenderDeviceError("Forward spot-shadow penumbra must be in [0, 1]", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      penumbra: spotShadowMap.penumbra
    });
  }
  if (!Number.isFinite(spotShadowMap.range) || spotShadowMap.range <= 0) {
    throw new RenderDeviceError("Forward spot-shadow range must be finite and positive", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      range: spotShadowMap.range
    });
  }
  const shadowMatrix = toFloat32Array(spotShadowMap.shadowMatrix, 16, "spotShadowMap.shadowMatrix", item.label);
  const strength = spotShadowMap.strength ?? prd02ShadowStrengthDefault();
  const bias = spotShadowMap.bias ?? 0.001;
  const slopeBias = spotShadowMap.slopeBias ?? 1;
  const texelSize = spotShadowMap.texelSize ?? [
    1 / Math.max(1, spotShadowMap.texture.texture?.width ?? 1),
    1 / Math.max(1, spotShadowMap.texture.texture?.height ?? 1)
  ];
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RenderDeviceError("Forward spot-shadow strength must be finite in [0, 1]", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      strength
    });
  }
  if (!Number.isFinite(bias) || bias < 0) {
    throw new RenderDeviceError("Forward spot-shadow bias must be finite and non-negative", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      bias
    });
  }
  if (!Number.isFinite(slopeBias) || slopeBias < 0) {
    throw new RenderDeviceError("Forward spot-shadow slopeBias must be finite and non-negative", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      slopeBias
    });
  }
  if (texelSize.length !== 2 || !texelSize.every((value) => Number.isFinite(value) && value > 0)) {
    throw new RenderDeviceError("Forward spot-shadow texelSize must contain two finite positive values", "FORWARD_SPOT_SHADOW_MAP_CONTRACT", {
      label: item.label,
      texelSize: Array.from(texelSize)
    });
  }
  const filterKernel = spotShadowMap.filterKernel ?? DEFAULT_FORWARD_SHADOW_FILTER_KERNEL;
  const spotShadowed = !receiveShadowDisabled(item);
  uniforms.set("u_spotShadowMapTexture", spotShadowMap.texture);
  uniforms.set("u_spotShadowMapEnabled", spotShadowed ? 1 : 0);
  uniforms.set("u_spotShadowLightPosition", spotShadowMap.lightPosition);
  uniforms.set("u_spotShadowLightDirection", spotShadowMap.lightDirection);
  uniforms.set("u_spotShadowMatrix", shadowMatrix);
  uniforms.set("u_spotShadowCone", [spotShadowMap.angle, spotShadowMap.penumbra ?? 0]);
  uniforms.set("u_spotShadowRange", spotShadowMap.range);
  uniforms.set("u_spotShadowStrength", spotShadowed ? strength : 0);
  uniforms.set("u_spotShadowBias", bias);
  uniforms.set("u_spotShadowSlopeBias", slopeBias);
  uniforms.set("u_spotShadowTexelSize", texelSize);
  uniforms.set("u_spotShadowPcfSampleCount", filterKernel.samples.length);
  uniforms.set("u_spotShadowPcfSamples", packForwardShadowPcfSamples(filterKernel, item.label));
}

export function applyClusteredLightingUniforms(
  clustered: ClusteredForwardLightingResources | null,
  shader: RenderShaderProgram,
  uniforms: Map<string, UniformValue>
): void {
  const required = [
    "u_clusteredLightEnabled",
    "u_clusterGridSize",
    "u_clusterViewportSize",
    "u_clusterLightData",
    "u_clusterLightIndices"
  ];
  if (!required.every((name) => shader.reflection.uniforms.has(name))) return;
  if (!clustered) {
    uniforms.set("u_clusteredLightEnabled", 0);
    uniforms.set("u_clusterGridSize", [1, 1]);
    uniforms.set("u_clusterViewportSize", [1, 1]);
    uniforms.set("u_clusterLightData", new TextureBinding({ name: "u_clusterLightData", required: false }));
    uniforms.set("u_clusterLightIndices", new TextureBinding({ name: "u_clusterLightIndices", required: false }));
    return;
  }
  uniforms.set("u_clusteredLightEnabled", 1);
  uniforms.set("u_clusterGridSize", [clustered.diagnostics.gridWidth, clustered.diagnostics.gridHeight]);
  uniforms.set("u_clusterViewportSize", [
    clustered.diagnostics.viewportWidth,
    clustered.diagnostics.viewportHeight
  ]);
  uniforms.set("u_clusterLightData", clustered.lightData);
  uniforms.set("u_clusterLightIndices", clustered.lightIndices);
}

export function toFloat32Array(values: Float32Array | readonly number[], expectedLength: number, name: string, label: string | undefined): Float32Array {
  const source = values instanceof Float32Array ? values : new Float32Array(values);
  if (source.length !== expectedLength || !isFiniteArrayLike(source)) {
    throw new RenderDeviceError(`${name} must contain ${expectedLength} finite values`, "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
      label,
      length: source.length,
      expectedLength
    });
  }
  return source;
}

export function packForwardShadowPcfSamples(filterKernel: ShadowFilterKernel, label: string | undefined): Float32Array {
  if (filterKernel.samples.length < 1 || filterKernel.samples.length > MAX_FORWARD_SHADOW_PCF_SAMPLES) {
    throw new RenderDeviceError("Forward shadow-map PCF kernel must contain 1 to 32 samples", "FORWARD_SHADOW_MAP_CONTRACT", {
      label,
      samples: filterKernel.samples.length
    });
  }
  const packed = new Float32Array(MAX_FORWARD_SHADOW_PCF_SAMPLES * 4);
  let weightSum = 0;
  for (const [index, sample] of filterKernel.samples.entries()) {
    if (![sample.x, sample.y, sample.weight].every(Number.isFinite) || sample.weight < 0) {
      throw new RenderDeviceError("Forward shadow-map PCF samples must contain finite offsets and non-negative weights", "FORWARD_SHADOW_MAP_CONTRACT", {
        label,
        sample
      });
    }
    const offset = index * 4;
    packed[offset] = sample.x;
    packed[offset + 1] = sample.y;
    packed[offset + 2] = sample.weight;
    weightSum += sample.weight;
  }
  if (weightSum <= 0) {
    throw new RenderDeviceError("Forward shadow-map PCF sample weights must sum to a positive value", "FORWARD_SHADOW_MAP_CONTRACT", {
      label,
      weightSum
    });
  }
  return packed;
}

export function validatePointShadowFaceRects(faceRects: Float32Array, label: string | undefined): void {
  for (let offset = 0; offset < faceRects.length; offset += 4) {
    const rect = [faceRects[offset], faceRects[offset + 1], faceRects[offset + 2], faceRects[offset + 3]];
    if (!rect.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || rect[2]! <= 0 || rect[3]! <= 0) {
      throw new RenderDeviceError("Forward point-shadow face rects must be normalized atlas rectangles", "FORWARD_POINT_SHADOW_MAP_CONTRACT", {
        label,
        face: offset / 4,
        rect
      });
    }
  }
}

export const DEFAULT_FORWARD_SHADOW_FILTER_KERNEL = createShadowFilterKernel({ filter: "pcf", pcfRadius: 1, pcfSamples: 9 });

export function renderItemWorldCenter(item: RenderItem): readonly [number, number, number] {
  const local = item.boundingBoxCenter ?? [
    (item.geometry.bounds.min[0] + item.geometry.bounds.max[0]) / 2,
    (item.geometry.bounds.min[1] + item.geometry.bounds.max[1]) / 2,
    (item.geometry.bounds.min[2] + item.geometry.bounds.max[2]) / 2
  ] as const;
  const matrix = item.modelMatrix;
  if (!matrix || matrix.length < 16) return local;
  return [
    matrix[0]! * local[0] + matrix[4]! * local[1] + matrix[8]! * local[2] + matrix[12]!,
    matrix[1]! * local[0] + matrix[5]! * local[1] + matrix[9]! * local[2] + matrix[13]!,
    matrix[2]! * local[0] + matrix[6]! * local[1] + matrix[10]! * local[2] + matrix[14]!
  ];
}

/**
 * §3.3 — clustered-light setup extracted from ForwardPass.execute() (verbatim body).
 */
export function resolveForwardClusteredLighting(
  lights: readonly CollectedLight[] | undefined,
  width: number,
  height: number,
  cameraViewProjectionMatrix: Float32Array | readonly number[] | undefined
): ClusteredForwardLightingResources | null {
  // T0-27: the forward pass uploads direct lights through `LightUniforms.pack`
  // (MAX_DIRECT_LIGHTS = 16) into `u_lightData[96]` (16 × 6 vec4). The 32-light
  // AuraLights std140 block has no program consuming it yet, so clustering must
  // engage above 16 with the flag on as well; a 32 threshold silently dropped
  // lights 17-32. Raise this only together with the pack cap and the shader
  // array once the AuraLights block program exists. Flag-off is unchanged (16).
  const count = lights?.length ?? 0;
  const clustered = count > FORWARD_DIRECT_LIGHT_CAPACITY
    ? createClusteredForwardLighting(
        lights ?? [],
        width,
        height,
        cameraViewProjectionMatrix
      )
    : null;
  if (rendererQrFlags().on("A3D_QR_LIGHTING")) {
    recordAuraLightsCounters(forwardLightCounters(count, clustered !== null));
  }
  return clustered;
}

/** T0-27: direct-light capacity of the forward uniform path (pack cap = shader array). */
export const FORWARD_DIRECT_LIGHT_CAPACITY = MAX_DIRECT_LIGHTS;

/**
 * T0-27 / C-28: lights the forward pass loses to a capacity cap. Clustered
 * shading reads every light from the cluster texture; the uniform path keeps
 * at most `FORWARD_DIRECT_LIGHT_CAPACITY`.
 */
export function forwardLightCounters(
  lightCount: number,
  clustered: boolean
): { lightsEvaluated: number; lightsDroppedByCap: number } {
  return {
    lightsEvaluated: lightCount,
    lightsDroppedByCap: clustered ? 0 : Math.max(0, lightCount - FORWARD_DIRECT_LIGHT_CAPACITY)
  };
}
