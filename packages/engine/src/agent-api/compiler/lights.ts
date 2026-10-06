// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraLightNode, AuraVec3, ProductionRuntimeLightDescriptor, AuraSceneSnapshot, AuraDirectionalShadowOptions, AuraLocalShadowOptions } from "../index.js";
import { clampNumber, groups, multiplyRgb, normalize3, normalizedDirection, productionRuntimeLightDirection, quaternionFromForwardDirection } from "../index.js";
import type { CollectedLight } from "@aura3d/rendering";
import { DirectionalLight, PointLight, SpotLight, type Light } from "@aura3d/scene";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";

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

// ---------- PRD-02 §6.3 / §6.4 — physical units + caster selection (flag path) ----------

/**
 * Physical-light descriptor: what an authored `lights.*` node means in
 * three-r185 units (PRD-02 §6.3). Ambient/hemisphere are non-punctual and
 * resolve through the environment path, so they return `null`.
 */
export interface PhysicalLightDescriptor extends ProductionRuntimeLightDescriptor {
  /** Inverse-power exponent (PRD-02 §6.3); 0 = no falloff (directional/ambient). */
  readonly decay: number;
  readonly shadowOptions?: AuraDirectionalShadowOptions | AuraLocalShadowOptions;
}

const FOUR_PI = 4 * Math.PI;

export function physicalLightDescriptor(node: AuraLightNode, name: string): PhysicalLightDescriptor | null {
  const color = (node.color ?? [1, 1, 1]) as readonly [number, number, number];
  const position = (node.position ?? [0, 0, 0]) as AuraVec3;
  const direction = productionRuntimeLightDirection(node, position);
  const shadowRequested = node.shadow === true || (typeof node.shadow === "object" && node.shadow !== null);
  const shadowDisabled = node.shadow === false;
  const shadowOptions = typeof node.shadow === "object" && node.shadow !== null ? node.shadow : undefined;
  switch (node.light) {
    case "directional":
    case "studio":
      return {
        kind: "directional",
        name,
        color,
        intensity: node.intensity ?? 3,
        position,
        direction,
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        decay: 0,
        shadowPriority: 3,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: node.light
      };
    case "point": {
      const cd = node.power !== undefined ? node.power / FOUR_PI : (node.intensity ?? 8);
      return {
        kind: "point",
        name,
        color,
        intensity: cd,
        position,
        direction,
        range: node.distance ?? 0,
        spotAngle: 0,
        penumbra: 0,
        decay: node.decay ?? 2,
        shadowPriority: 1,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: "point"
      };
    }
    case "spot": {
      const cd = node.power !== undefined ? node.power / Math.PI : (node.intensity ?? 30);
      return {
        kind: "spot",
        name,
        color,
        intensity: cd,
        position,
        direction,
        range: node.distance ?? 0,
        spotAngle: node.angle ?? Math.PI / 6,
        penumbra: node.penumbra ?? 0,
        decay: node.decay ?? 2,
        shadowPriority: 2,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: "spot"
      };
    }
    case "rect":
    case "softbox": {
      return {
        kind: "rect-area",
        name,
        color,
        intensity: node.intensity ?? 1.4,
        position,
        direction,
        range: 0,
        spotAngle: 0,
        penumbra: 0,
        decay: 0,
        shadowPriority: 1,
        shadowRequested,
        shadowDisabled,
        shadowOptions,
        authoredLight: node.light,
        authoredWidth: node.width ?? 1,
        authoredHeight: node.height ?? 1
      };
    }
    default:
      return null; // ambient / hemisphere resolve through the environment path
  }
}

export interface ShadowedLightSelection {
  /** Descriptors that get shadow maps this frame, in atlas order. */
  readonly casters: readonly PhysicalLightDescriptor[];
  /** Names of shadow-requesting lights dropped by the tier cap (diagnostic). */
  readonly droppedNames: readonly string[];
}

/**
 * Caster selection (PRD-02 §6.4): explicit `shadow: true` first (priority,
 * then authored order), then `autoSunShadow` promotes the brightest
 * directional **only when no directional carries an explicit shadow
 * setting** (requested or disabled). Point/spot/rect never cast implicitly.
 */
export function selectShadowedLights(
  descriptors: readonly PhysicalLightDescriptor[],
  options: { readonly autoSunShadow?: boolean; readonly max?: number } = {}
): ShadowedLightSelection {
  const max = options.max ?? 4;
  const autoSun = options.autoSunShadow ?? true;
  const requested = descriptors.filter((d) => d.shadowRequested && !d.shadowDisabled);
  const casters: PhysicalLightDescriptor[] = [...requested].sort((a, b) =>
    b.shadowPriority - a.shadowPriority || a.name.localeCompare(b.name)
  );
  const anyDirectionalExplicit = descriptors.some((d) => d.kind === "directional" && (d.shadowRequested || d.shadowDisabled));
  if (autoSun && !anyDirectionalExplicit && casters.length < max) {
    const sun = descriptors
      .filter((d) => d.kind === "directional" && !d.shadowDisabled)
      .sort((a, b) => b.intensity - a.intensity || a.name.localeCompare(b.name))[0];
    if (sun) casters.push({ ...sun, shadowRequested: true });
  }
  const kept = casters.slice(0, Math.max(0, max));
  const dropped = casters.slice(Math.max(0, max)).map((d) => d.name);
  return { casters: kept, droppedNames: dropped };
}

/** lighting.quality "auto" → the C-27-resolved tier from the compile context (PRD-02 §6.8). */
export function resolveLightingTier(
  requested: AuraQualityTier | "auto" | undefined,
  ctx: { readonly quality: { readonly tier: AuraQualityTier } }
): AuraQualityTier {
  return !requested || requested === "auto" ? ctx.quality.tier : requested;
}
