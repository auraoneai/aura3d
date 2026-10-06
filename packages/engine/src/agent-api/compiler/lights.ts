// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraLightNode, AuraVec3, ProductionRuntimeLightDescriptor } from "../index.js";
import { clampNumber, multiplyRgb, normalize3, normalizedDirection, productionRuntimeLightDirection, quaternionFromForwardDirection } from "../index.js";
import type { CollectedLight } from "@aura3d/rendering";
import { DirectionalLight, PointLight, SpotLight, type Light } from "@aura3d/scene";

export function createProductionRuntimeFallbackLights(): readonly CollectedLight[] {
  if (cachedProductionRuntimeFallbackLights) return cachedProductionRuntimeFallbackLights;
  const descriptors: readonly ProductionRuntimeLightDescriptor[] = [
    {
      kind: "directional",
      name: "aura3d-root-production-fallback-key-shadow",
      color: [1, 0.94, 0.82],
      intensity: 2.6,
      position: [0, 0, 0],
      direction: [0.44, -0.64, -0.63],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 3,
      shadowRequested: false,
      authoredLight: "fallback"
    },
    {
      kind: "directional",
      name: "aura3d-root-production-fallback-fill",
      color: [0.52, 0.64, 0.9],
      intensity: 0.64,
      position: [0, 0, 0],
      direction: [-0.5, -0.28, -0.82],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: "fallback"
    },
    {
      kind: "directional",
      name: "aura3d-root-production-fallback-rim",
      color: [0.88, 0.94, 1],
      intensity: 0.88,
      position: [0, 0, 0],
      direction: [-0.24, -0.36, 0.9],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: "fallback"
    }
  ];
  cachedProductionRuntimeFallbackLights = descriptors.map((descriptor, index) =>
    createProductionRuntimeCollectedLight(descriptor, index === 0)
  );
  return cachedProductionRuntimeFallbackLights;
}

let cachedProductionRuntimeFallbackLights: readonly CollectedLight[] | undefined;

export function createProductionRuntimeStudioLightDescriptors(
  node: AuraLightNode,
  name: string,
  color: readonly [number, number, number],
  intensity: number,
  position: AuraVec3
): readonly ProductionRuntimeLightDescriptor[] {
  const target = node.lookAt ?? [0, 0.75, 0] as const;
  const fillPosition: AuraVec3 = [
    position[0] === 0 ? 3.2 : -position[0],
    Math.max(1, position[1] * 0.72),
    position[2] * 0.58
  ];
  const rimPosition: AuraVec3 = [
    position[0] * 0.2,
    Math.max(1, position[1] * 0.88),
    position[2] === 0 ? -3.6 : -Math.abs(position[2])
  ];
  return [
    {
      kind: "directional",
      name: `${name}-key`,
      color,
      intensity,
      position,
      direction: productionRuntimeLightDirection(node, position),
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 3,
      shadowRequested: false,
      authoredLight: node.light
    },
    {
      kind: "directional",
      name: `${name}-fill`,
      color: multiplyRgb(color, [0.62, 0.72, 1]),
      intensity: intensity * 0.32,
      position: fillPosition,
      direction: normalizedDirection(fillPosition, target),
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: node.light
    },
    {
      kind: "directional",
      name: `${name}-rim`,
      color: multiplyRgb(color, [0.84, 0.92, 1]),
      intensity: intensity * 0.54,
      position: rimPosition,
      direction: normalizedDirection(rimPosition, target),
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 0,
      shadowRequested: false,
      authoredLight: node.light
    }
  ];
}

export function createProductionRuntimeCollectedLight(
  descriptor: ProductionRuntimeLightDescriptor,
  castsShadow: boolean
): CollectedLight {
  const source: Light = descriptor.kind === "directional"
    ? new DirectionalLight(descriptor.name)
    : descriptor.kind === "point"
      ? new PointLight(descriptor.name)
      : new SpotLight(descriptor.name);
  source.color = [...descriptor.color];
  source.intensity = descriptor.intensity;
  source.castsShadow = castsShadow;
  source.layerMask = 0xffffffff;
  source.userData.aura3dAuthoredLight = descriptor.authoredLight;
  if (descriptor.authoredWidth !== undefined) source.userData.aura3dAuthoredWidth = descriptor.authoredWidth;
  if (descriptor.authoredHeight !== undefined) source.userData.aura3dAuthoredHeight = descriptor.authoredHeight;
  source.transform.setPosition(...descriptor.position);
  if (source instanceof PointLight || source instanceof SpotLight) {
    source.range = Math.max(0.001, descriptor.range);
  }
  if (source instanceof SpotLight) {
    source.angle = clampNumber(descriptor.spotAngle, 0.001, Math.PI / 2 - 0.001);
    source.penumbra = clampNumber(descriptor.penumbra, 0, 1);
  }
  if (!(source instanceof PointLight)) {
    const rotation = quaternionFromForwardDirection(descriptor.direction);
    source.transform.setRotation(...rotation);
  }
  source.updateWorldTransform(true);
  return {
    kind: descriptor.kind,
    color: descriptor.color,
    intensity: descriptor.intensity,
    position: descriptor.position,
    direction: normalize3(descriptor.direction),
    range: descriptor.range,
    spotAngle: descriptor.spotAngle,
    penumbra: descriptor.penumbra,
    castsShadow,
    layerMask: 0xffffffff,
    source
  };
}
