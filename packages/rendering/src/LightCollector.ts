import { DirectionalLight, Light, PointLight, RectAreaLight, Scene, SpotLight, type SceneNode } from "@aura3d/scene";
import type { PhotometricProfileTable } from "./lighting/PhotometricProfileAtlas";
import type { ProjectedSpotImage } from "./lighting/ProjectedSpotBindings";

export type CollectedLightKind = "directional" | "point" | "spot" | "rect-area";

/** Measured absolute candela distribution for a point or spot light. */
export interface CollectedPhotometricProfile {
  readonly profile: PhotometricProfileTable;
  readonly scale?: number;
  readonly rotation?: number;
}

export interface CollectedLight {
  readonly kind: CollectedLightKind;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly right?: readonly [number, number, number];
  readonly up?: readonly [number, number, number];
  readonly range: number;
  readonly width?: number;
  readonly height?: number;
  /** Both faces of a rect, or both cones of its legacy spot proxy. */
  readonly twoSided?: boolean;
  readonly spotAngle: number;
  readonly penumbra: number;
  /**
   * Physical inverse-power exponent (PRD-02 §6.3) when the descriptor came
   * from the physical path; undefined = legacy (shader's hardcoded decay 2).
   * Recorded now (Live Fix E3 stage 1); the legacy packer/shader twins do
   * not read it yet — stage 2 packs it and the chunks apply it.
   */
  readonly decay?: number;
  /** Enumerable profile metadata retained across per-frame light copies. */
  readonly photometricProfile?: CollectedPhotometricProfile;
  /** Effective visibility when known. Omission does not authorize profile rendering. */
  readonly photometricVisible?: boolean;
  /** Independent dimensionless profile dimmer; scalar intensity is not its denominator. */
  readonly photometricDimmer?: number;
  /** Live authored image metadata; the renderer resolves its owned resource per frame. */
  readonly projectedImage?: ProjectedSpotImage<unknown>;
  readonly castsShadow: boolean;
  readonly layerMask: number;
  readonly source: Light;
}

export interface LightCollectorOptions {
  readonly maxLights?: number;
  readonly layerMask?: number;
  /** Include locally or ancestrally hidden lights; other filters still apply. */
  readonly includeDisabled?: boolean;
}

/** Check through the scene root when present, without mutating state. Absent compiled sources are eligible. */
export function isLightVisibleInHierarchy(light: Light | null | undefined, root?: SceneNode): boolean {
  let node: SceneNode | null | undefined = light;
  while (node) {
    if (node.visible === false) return false;
    if (node === root) break;
    node = node.parent;
  }
  return true;
}

export class LightCollector {
  collect(scene: Scene, options: LightCollectorOptions = {}): readonly CollectedLight[] {
    const maxLights = options.maxLights ?? Number.POSITIVE_INFINITY;
    if (maxLights !== Number.POSITIVE_INFINITY && (!Number.isInteger(maxLights) || maxLights < 0)) {
      throw new RangeError("LightCollector maxLights must be a non-negative integer");
    }
    scene.updateWorldTransforms();
    return scene
      .collectLights()
      .filter((light) => (options.includeDisabled ?? false) || isLightVisibleInHierarchy(light, scene.root))
      .filter((light) => ((options.layerMask ?? 0xffffffff) & light.layerMask) !== 0)
      .map((light) => collectLight(light))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, maxLights);
  }
}

export function collectLight(light: Light): CollectedLight {
  if (light instanceof RectAreaLight && light.twoSided && light.castsShadow) {
    throw new Error("TWO_SIDED_RECT_SHADOW_UNSUPPORTED: rectangular lights do not support two-sided shadow maps");
  }
  const matrix = matrixElements(light.transform.worldMatrix);
  const position: [number, number, number] = [matrix[12], matrix[13], matrix[14]];
  const direction = light instanceof DirectionalLight
    ? vectorToTuple(light.getDirection())
    : normalize([-matrix[8], -matrix[9], -matrix[10]]);
  const right = normalize([matrix[0], matrix[1], matrix[2]]);
  const up = normalize([matrix[4], matrix[5], matrix[6]]);
  const range = light instanceof PointLight || light instanceof SpotLight || light instanceof RectAreaLight ? light.range : 0;
  const width = light instanceof RectAreaLight ? light.width : 0;
  const height = light instanceof RectAreaLight ? light.height : 0;
  const spotAngle = light instanceof SpotLight ? light.angle : 0;
  const penumbra = light instanceof SpotLight ? light.penumbra : 0;
  return {
    kind: light.kind,
    color: vectorToTuple(light.color),
    intensity: light.intensity,
    position,
    direction,
    right,
    up,
    range,
    width,
    height,
    ...(light instanceof RectAreaLight && light.twoSided ? { twoSided: true } : {}),
    spotAngle,
    penumbra,
    castsShadow: light.castsShadow,
    layerMask: light.layerMask,
    source: light
  };
}

function vectorToTuple(value: unknown): readonly [number, number, number] {
  if (Array.isArray(value)) {
    return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
  }
  const vector = value as { readonly x?: number; readonly y?: number; readonly z?: number };
  return [vector.x ?? 0, vector.y ?? 0, vector.z ?? 0];
}

function matrixElements(value: unknown): readonly number[] {
  const elements = (value as { readonly elements?: readonly number[] }).elements;
  return elements ?? (value as readonly number[]);
}

function normalize(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length === 0
    ? [0, 0, -1]
    : [canonicalZero(value[0] / length), canonicalZero(value[1] / length), canonicalZero(value[2] / length)];
}

function canonicalZero(value: number): number {
  return value === 0 ? 0 : value;
}
