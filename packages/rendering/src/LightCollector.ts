import { DirectionalLight, Light, PointLight, Scene, SpotLight } from "@galileo3d/scene";

export type CollectedLightKind = "directional" | "point" | "spot";

export interface CollectedLight {
  readonly kind: CollectedLightKind;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly range: number;
  readonly spotAngle: number;
  readonly penumbra: number;
  readonly castsShadow: boolean;
  readonly layerMask: number;
  readonly source: Light;
}

export interface LightCollectorOptions {
  readonly maxLights?: number;
  readonly layerMask?: number;
  readonly includeDisabled?: boolean;
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
      .filter((light) => (options.includeDisabled ?? false) || light.visible)
      .filter((light) => ((options.layerMask ?? 0xffffffff) & light.layerMask) !== 0)
      .map((light) => collectLight(light))
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, maxLights);
  }
}

function collectLight(light: Light): CollectedLight {
  const matrix = matrixElements(light.transform.worldMatrix);
  const position: [number, number, number] = [matrix[12], matrix[13], matrix[14]];
  const direction = light instanceof DirectionalLight
    ? vectorToTuple(light.getDirection())
    : normalize([-matrix[8], -matrix[9], -matrix[10]]);
  const range = light instanceof PointLight || light instanceof SpotLight ? light.range : 0;
  const spotAngle = light instanceof SpotLight ? light.angle : 0;
  const penumbra = light instanceof SpotLight ? light.penumbra : 0;
  return {
    kind: light.kind,
    color: vectorToTuple(light.color),
    intensity: light.intensity,
    position,
    direction,
    range,
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
  return length === 0 ? [0, 0, -1] : [value[0] / length, value[1] / length, value[2] / length];
}
