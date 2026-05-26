import { DirectionalLight, Light } from "@aura3d/scene";
import { type Bounds3 } from "./Geometry";
import { type RenderItem } from "./ForwardPass";
import { type RenderDeviceDiagnostics } from "./RenderDevice";
import { type RenderPassContext } from "./RenderPass";
import { ShadowMap } from "./ShadowMap";
import { ShadowPass, type ShadowPassReason } from "./ShadowPass";
import { type ShaderLibrary } from "./ShaderLibrary";

export interface CascadeSplitOptions {
  readonly cascadeCount: number;
  readonly near: number;
  readonly far: number;
  readonly lambda?: number;
}

export interface CascadeSplit {
  readonly index: number;
  readonly near: number;
  readonly far: number;
}

export interface CascadedShadowMapsOptions extends CascadeSplitOptions {
  readonly size?: number;
  readonly bias?: number;
  readonly filter?: ShadowMap["filterKernel"]["mode"];
  readonly pcfRadius?: number;
  readonly pcfSamples?: number;
  readonly label?: string;
}

export interface ShadowCascade {
  readonly index: number;
  readonly split: CascadeSplit;
  readonly shadowMap: ShadowMap;
}

export type ShadowCameraVec3 = readonly [number, number, number];

export interface ShadowCameraFrustumOptions {
  readonly position: ShadowCameraVec3;
  readonly target: ShadowCameraVec3;
  readonly up?: ShadowCameraVec3;
  readonly fovYRadians: number;
  readonly aspect: number;
}

export interface ShadowCameraFitOptions {
  readonly camera: ShadowCameraFrustumOptions;
  readonly lightDirection: ShadowCameraVec3;
  readonly casters: readonly RenderItem[];
  readonly receivers?: readonly RenderItem[];
  readonly padding?: number;
  readonly stabilize?: boolean;
}

export interface LightSpaceBounds {
  readonly min: ShadowCameraVec3;
  readonly max: ShadowCameraVec3;
}

export interface ShadowCameraFit {
  readonly cascadeIndex: number;
  readonly split: CascadeSplit;
  readonly mapSize: number;
  readonly texelSize: number;
  readonly lightDirection: ShadowCameraVec3;
  readonly basis: {
    readonly right: ShadowCameraVec3;
    readonly up: ShadowCameraVec3;
    readonly forward: ShadowCameraVec3;
  };
  readonly frustumCornersWorld: readonly ShadowCameraVec3[];
  readonly casterBoundsWorld: Bounds3 | null;
  readonly receiverBoundsWorld: Bounds3 | null;
  readonly combinedBoundsWorld: Bounds3;
  readonly lightSpaceBounds: LightSpaceBounds;
  readonly centerLightSpace: ShadowCameraVec3;
  readonly snappedCenterLightSpace: ShadowCameraVec3;
  readonly stableOffsetLightSpace: ShadowCameraVec3;
  readonly orthographic: {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly top: number;
    readonly near: number;
    readonly far: number;
  };
  readonly casterCount: number;
  readonly receiverCount: number;
}

export class CascadedShadowMaps {
  private readonly cascades: readonly ShadowCascade[];

  constructor(options: CascadedShadowMapsOptions) {
    const size = options.size ?? 1024;
    const bias = options.bias ?? 0.001;
    const label = options.label ?? "csm";
    this.cascades = CascadedShadowMaps.computeSplits(options).map((split) => ({
      index: split.index,
      split,
      shadowMap: new ShadowMap({
        size,
        bias,
        filter: options.filter,
        pcfRadius: options.pcfRadius,
        pcfSamples: options.pcfSamples,
        label: `${label}-cascade-${split.index}`
      })
    }));
  }

  static computeSplits(options: CascadeSplitOptions): readonly CascadeSplit[] {
    const { cascadeCount, near, far, lambda = 0.5 } = options;
    if (!Number.isInteger(cascadeCount) || cascadeCount <= 0) {
      throw new Error("Cascade count must be a positive integer");
    }
    if (near <= 0 || far <= near) {
      throw new Error("Cascade near/far range is invalid");
    }
    if (lambda < 0 || lambda > 1) {
      throw new Error("Cascade lambda must be between 0 and 1");
    }

    const splits: CascadeSplit[] = [];
    let previous = near;
    for (let index = 1; index <= cascadeCount; index += 1) {
      const ratio = index / cascadeCount;
      const logarithmic = near * (far / near) ** ratio;
      const uniform = near + (far - near) * ratio;
      const cascadeFar = index === cascadeCount ? far : lambda * logarithmic + (1 - lambda) * uniform;
      splits.push({
        index: index - 1,
        near: previous,
        far: cascadeFar
      });
      previous = cascadeFar;
    }
    return splits;
  }

  get cascadeCount(): number {
    return this.cascades.length;
  }

  getCascades(): readonly ShadowCascade[] {
    return this.cascades;
  }

  computeStableCameraFits(options: ShadowCameraFitOptions): readonly ShadowCameraFit[] {
    return this.cascades.map((cascade) => computeShadowCameraFit(cascade, options));
  }

  resize(size: number): CascadedShadowMaps {
    const first = this.cascades[0];
    if (!first) {
      throw new Error("Cannot resize cascaded shadow maps without cascades");
    }
    const resized = Object.create(CascadedShadowMaps.prototype) as CascadedShadowMaps;
    Object.assign(resized, {
      cascades: this.cascades.map((cascade) => ({
        index: cascade.index,
        split: cascade.split,
        shadowMap: cascade.shadowMap.resize(size)
      }))
    });
    return resized;
  }

  dispose(): void {
    for (const cascade of this.cascades) {
      cascade.shadowMap.dispose();
    }
  }
}

function computeShadowCameraFit(cascade: ShadowCascade, options: ShadowCameraFitOptions): ShadowCameraFit {
  const padding = options.padding ?? 0.25;
  if (!Number.isFinite(padding) || padding < 0) {
    throw new Error("Shadow camera fit padding must be finite and non-negative");
  }
  const basis = lightBasis(options.lightDirection);
  const frustumCornersWorld = cameraFrustumCorners(options.camera, cascade.split);
  const casterBoundsWorld = mergeItemBounds(options.casters);
  const receiverBoundsWorld = mergeItemBounds(options.receivers ?? []);
  const combinedBoundsWorld = expandBounds(mergeBounds([boundsFromPoints(frustumCornersWorld), casterBoundsWorld, receiverBoundsWorld]), padding);
  const lightSpacePoints = corners(combinedBoundsWorld).map((point) => projectToLightSpace(point, basis));
  const lightSpaceBounds = boundsFromPoints(lightSpacePoints);
  const centerLightSpace: ShadowCameraVec3 = [
    (lightSpaceBounds.min[0] + lightSpaceBounds.max[0]) / 2,
    (lightSpaceBounds.min[1] + lightSpaceBounds.max[1]) / 2,
    (lightSpaceBounds.min[2] + lightSpaceBounds.max[2]) / 2
  ];
  const width = Math.max(1e-6, lightSpaceBounds.max[0] - lightSpaceBounds.min[0]);
  const height = Math.max(1e-6, lightSpaceBounds.max[1] - lightSpaceBounds.min[1]);
  const extent = Math.max(width, height);
  const texelSize = extent / cascade.shadowMap.size;
  const snappedCenterLightSpace = options.stabilize === false ? centerLightSpace : [
    snap(centerLightSpace[0], texelSize),
    snap(centerLightSpace[1], texelSize),
    centerLightSpace[2]
  ] as const;
  const halfExtent = extent / 2;
  const depthPadding = Math.max(padding, extent * 0.05);
  return {
    cascadeIndex: cascade.index,
    split: cascade.split,
    mapSize: cascade.shadowMap.size,
    texelSize,
    lightDirection: normalize(options.lightDirection),
    basis,
    frustumCornersWorld,
    casterBoundsWorld,
    receiverBoundsWorld,
    combinedBoundsWorld,
    lightSpaceBounds,
    centerLightSpace,
    snappedCenterLightSpace,
    stableOffsetLightSpace: [
      snappedCenterLightSpace[0] - centerLightSpace[0],
      snappedCenterLightSpace[1] - centerLightSpace[1],
      snappedCenterLightSpace[2] - centerLightSpace[2]
    ],
    orthographic: {
      left: snappedCenterLightSpace[0] - halfExtent,
      right: snappedCenterLightSpace[0] + halfExtent,
      bottom: snappedCenterLightSpace[1] - halfExtent,
      top: snappedCenterLightSpace[1] + halfExtent,
      near: lightSpaceBounds.min[2] - depthPadding,
      far: lightSpaceBounds.max[2] + depthPadding
    },
    casterCount: options.casters.length,
    receiverCount: options.receivers?.length ?? 0
  };
}

function cameraFrustumCorners(camera: ShadowCameraFrustumOptions, split: CascadeSplit): readonly ShadowCameraVec3[] {
  if (!Number.isFinite(camera.fovYRadians) || camera.fovYRadians <= 0 || camera.fovYRadians >= Math.PI) {
    throw new Error("Shadow camera fit requires a finite perspective fov in radians");
  }
  if (!Number.isFinite(camera.aspect) || camera.aspect <= 0) {
    throw new Error("Shadow camera fit requires a finite positive aspect ratio");
  }
  const forward = normalize(sub(camera.target, camera.position));
  const right = normalize(cross(forward, camera.up ?? [0, 1, 0]));
  const up = normalize(cross(right, forward));
  return [split.near, split.far].flatMap((distance) => {
    const halfHeight = Math.tan(camera.fovYRadians / 2) * distance;
    const halfWidth = halfHeight * camera.aspect;
    const center = add(camera.position, scale(forward, distance));
    return [
      add(add(center, scale(right, -halfWidth)), scale(up, -halfHeight)),
      add(add(center, scale(right, halfWidth)), scale(up, -halfHeight)),
      add(add(center, scale(right, halfWidth)), scale(up, halfHeight)),
      add(add(center, scale(right, -halfWidth)), scale(up, halfHeight))
    ];
  });
}

function mergeItemBounds(items: readonly RenderItem[]): Bounds3 | null {
  const bounds = items.map(worldBoundsForItem);
  return bounds.length > 0 ? mergeBounds(bounds) : null;
}

function worldBoundsForItem(item: RenderItem): Bounds3 {
  return boundsFromPoints(corners(item.geometry.bounds).map((point) => transformPoint(point, item.modelMatrix)));
}

function transformPoint(point: ShadowCameraVec3, matrix: Float32Array | readonly number[] | undefined): ShadowCameraVec3 {
  if (!matrix) {
    return point;
  }
  if (matrix.length < 16) {
    throw new Error("RenderItem modelMatrix must contain 16 numbers for shadow camera fitting");
  }
  return [
    matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
    matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
    matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!
  ];
}

function lightBasis(lightDirection: ShadowCameraVec3): ShadowCameraFit["basis"] {
  const forward = normalize(scale(normalize(lightDirection), -1));
  const fallbackUp: ShadowCameraVec3 = Math.abs(forward[1]) > 0.94 ? [0, 0, 1] : [0, 1, 0];
  const right = normalize(cross(fallbackUp, forward));
  const up = normalize(cross(forward, right));
  return { right, up, forward };
}

function projectToLightSpace(point: ShadowCameraVec3, basis: ShadowCameraFit["basis"]): ShadowCameraVec3 {
  return [dot(point, basis.right), dot(point, basis.up), dot(point, basis.forward)];
}

function mergeBounds(bounds: readonly (Bounds3 | null)[]): Bounds3 {
  const filtered = bounds.filter((value): value is Bounds3 => value !== null);
  if (filtered.length === 0) {
    throw new Error("Cannot merge empty shadow fitting bounds");
  }
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const bound of filtered) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, bound.min[axis]!);
      max[axis] = Math.max(max[axis]!, bound.max[axis]!);
    }
  }
  return { min, max };
}

function expandBounds(bounds: Bounds3, padding: number): Bounds3 {
  return {
    min: [bounds.min[0] - padding, bounds.min[1] - padding, bounds.min[2] - padding],
    max: [bounds.max[0] + padding, bounds.max[1] + padding, bounds.max[2] + padding]
  };
}

function boundsFromPoints(points: readonly ShadowCameraVec3[]): Bounds3 {
  if (points.length === 0) {
    throw new Error("Cannot compute shadow bounds from no points");
  }
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, point[axis]!);
      max[axis] = Math.max(max[axis]!, point[axis]!);
    }
  }
  return { min, max };
}

function corners(bounds: Bounds3): readonly ShadowCameraVec3[] {
  const { min, max } = bounds;
  return [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], max[2]],
    [min[0], max[1], max[2]]
  ];
}

function snap(value: number, increment: number): number {
  if (!Number.isFinite(increment) || increment <= 0) {
    return value;
  }
  return Math.round(value / increment) * increment;
}

function add(a: ShadowCameraVec3, b: ShadowCameraVec3): ShadowCameraVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: ShadowCameraVec3, b: ShadowCameraVec3): ShadowCameraVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: ShadowCameraVec3, amount: number): ShadowCameraVec3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function dot(a: ShadowCameraVec3, b: ShadowCameraVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: ShadowCameraVec3, b: ShadowCameraVec3): ShadowCameraVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize(value: ShadowCameraVec3): ShadowCameraVec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 1e-8) {
    throw new Error("Shadow camera fitting vector cannot be zero");
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

export interface CascadedShadowPassOptions {
  readonly light: Light | null;
  readonly casters: readonly RenderItem[];
  readonly cascades: CascadedShadowMaps;
  readonly shaderLibrary?: ShaderLibrary;
}

export interface CascadeShadowPassResult {
  readonly index: number;
  readonly split: CascadeSplit;
  readonly rendered: boolean;
  readonly reason: ShadowPassReason;
  readonly casterCount: number;
  readonly skippedTransparentCasters: number;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly shadowMap: ShadowMap;
}

export interface CascadedShadowPassResult {
  readonly rendered: boolean;
  readonly cascades: readonly CascadeShadowPassResult[];
}

export class CascadedShadowPass {
  private lastResult: CascadedShadowPassResult | null = null;

  constructor(private readonly options: CascadedShadowPassOptions) {}

  execute(context: RenderPassContext): CascadedShadowPassResult {
    const cascadeResults = this.options.cascades.getCascades().map((cascade) => {
      const shadowPass = new ShadowPass({
        light: this.options.light,
        casters: this.options.casters,
        shadowMap: cascade.shadowMap,
        ...(this.options.shaderLibrary ? { shaderLibrary: this.options.shaderLibrary } : {})
      });
      const result = shadowPass.execute(context);
      return {
        index: cascade.index,
        split: cascade.split,
        rendered: result.rendered,
        reason: result.reason,
        casterCount: result.casterCount,
        skippedTransparentCasters: result.skippedTransparentCasters,
        diagnostics: result.diagnostics,
        shadowMap: cascade.shadowMap
      };
    });
    this.lastResult = {
      rendered: cascadeResults.length > 0 && cascadeResults.every((cascade) => cascade.rendered),
      cascades: cascadeResults
    };
    return this.lastResult;
  }

  getLastResult(): CascadedShadowPassResult | null {
    return this.lastResult;
  }
}

export function supportsCascadedShadowLight(light: Light | null): light is DirectionalLight {
  return light instanceof DirectionalLight && light.visible && light.castsShadow;
}
