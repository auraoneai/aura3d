// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraSceneNode, AuraModelNode, AuraPrimitiveNode, AuraLightNode, AuraRendererRuntimeObservation, AuraSceneSnapshot, ProductionRuntimePrimitiveEntry, ProductionRuntimeLightDescriptor } from "../nodes/types.js";
import type { CollectedLight, RenderDeviceDiagnostics, RendererShadowOptions } from "@aura3d/rendering";
import { AuraSceneBuilder, scene } from "../nodes/scene.js";
import { colorToLinearRgb } from "./color.js";
import { createAssetProvenance } from "../devtools/diagnostics.js";
import { createAuraApp } from "../app/createAuraApp.js";
import { createProductionRuntimeCollectedLight, createProductionRuntimeFallbackLights, createProductionRuntimeStudioLightDescriptors } from "./lights.js";
import { describeTextureStreamingResidency } from "./primitives.js";
import { distance3 } from "../nodes/character.js";
import { effects } from "../nodes/effects.composite.js";
import { groups } from "../nodes/groups.js";
import { lights } from "../nodes/lights.js";
import { model, unsafeModelUrl } from "../nodes/model.js";
import { normalize3 } from "../index.js";
import { normalizeTextureBudgetBytes } from "../app/rendererOptions.js";
import { primitive } from "../nodes/primitives.js";
import { renderer } from "../devtools/rendererDiagnostics.js";
import { rotationXYZ } from "./sceneMath.js";
import { shadows } from "../nodes/shadows.js";

interface AuraProductionBridgeEligibility {
  readonly eligible: boolean;
  readonly typedModelCount: number;
  readonly unsafeModelCount: number;
  readonly inlineModelCount: number;
  readonly primitiveCount: number;
  readonly effectCount: number;
  readonly reasons: readonly string[];
}

export function analyzeProductionBridgeEligibility(nodes: readonly AuraSceneNode[]): AuraProductionBridgeEligibility {
  const modelNodes = nodes.filter(isRenderableModelNode);
  const typedModelCount = modelNodes.filter((node) => createAssetProvenance(node.asset).source === "typed-aura-assets-manifest").length;
  const unsafeModelCount = modelNodes.filter((node) => createAssetProvenance(node.asset).source === "unsafe-url").length;
  const inlineModelCount = modelNodes.filter((node) => createAssetProvenance(node.asset).source === "inline-definition").length;
  const primitiveCount = nodes.filter((node) => node.kind === "primitive").length;
  const effectCount = nodes.filter((node) => node.kind === "effect").length;
  const reasons: string[] = [];
  if (unsafeModelCount > 0) reasons.push("unsafeModelUrl and remote/raw model URLs are blocked from the production bridge");
  if (inlineModelCount > 0) reasons.push("inline model definitions without manifest hashes are blocked from the production bridge");
  return {
    eligible: reasons.length === 0,
    typedModelCount,
    unsafeModelCount,
    inlineModelCount,
    primitiveCount,
    effectCount,
    reasons
  };
}

export function isRenderableModelNode(node: AuraSceneNode): node is AuraModelNode {
  return node.kind === "model" && node.visible !== false && Boolean(node.asset.url) && ["glb", "gltf"].includes(node.asset.format);
}

export function isWebGLRenderableNode(node: AuraSceneNode): node is AuraModelNode | AuraPrimitiveNode {
  return isRenderableModelNode(node) || node.kind === "primitive";
}

/**
 * Translates a public `effects.fog(...)` node into renderer forward-pass fog.
 *
 * Without this the root bridge never set `environmentFog`, so `effects.fog()` was
 * accepted by the scene builder, reported as `fog.enabled` in diagnostics, and
 * changed exactly zero pixels through `createAuraApp`. Returning `false` when no
 * fog node is authored keeps the unfogged path unchanged.
 */





export function resolveNativeBloomRadius(authoredRadius: number | undefined): number {
  const radius = authoredRadius ?? 0.38;
  const normalizedKernel = radius <= 1 ? Math.round(radius * 8) : Math.round(radius);
  return Math.max(1, Math.min(4, normalizedKernel));
}

/**
 * Shadow bias is compared in normalized light-depth space. Directional maps use
 * an orthographic projection, so their existing scene-radius/texel heuristic is
 * world-linear. A spot map is perspective: applying that world-space value at
 * the far end of its cone erased legitimate caster/receiver separation (Aura
 * Clash measured 0.00147 normalized depth versus the old 0.004 constant bias),
 * and the default slope term could erase the remainder on a vertical receiver.
 * Keep the established directional/point policy intact and use a bounded
 * fraction of one normalized spot-map texel for both perspective terms.
 */
export function resolveProductionRuntimeShadowTuning(
  kind: CollectedLight["kind"] | undefined,
  size: number,
  sceneRadius: number
): { readonly bias: number; readonly slopeBias?: number } {
  if (!Number.isInteger(size) || size <= 0) throw new RangeError("Shadow-map size must be a positive integer.");
  if (!Number.isFinite(sceneRadius) || sceneRadius <= 0) throw new RangeError("Shadow scene radius must be finite and positive.");
  if (kind === "spot") {
    return {
      bias: clampNumber(0.15 / size, 0.00005, 0.00035),
      slopeBias: 0.12
    };
  }
  const texelWorldSize = (sceneRadius * 2) / size;
  return { bias: clampNumber(texelWorldSize * 0.55, 0.00035, 0.004) };
}

/**
 * Device-observed shadow state. `requested` comes from the submitted shadow
 * options, but `mapRendered`/`mapSampled` come only from what the device
 * actually did: a shadow depth target has to exist and a shader has to bind and
 * sample it. This is what stops the root report from publishing an unconditional
 * `shadows.enabled: true`.
 */
export function createProductionRuntimeShadowObservation(
  shadowOptions: RendererShadowOptions,
  diagnostics: RenderDeviceDiagnostics,
  observed: Readonly<Record<string, unknown>> | null
): NonNullable<AuraRendererRuntimeObservation["shadow"]> {
  const nativeShadowMapBindings = diagnostics.nativeShadowMapBindings ?? 0;
  const mapRendered = Boolean(shadowOptions.enabled) && observed !== null && (diagnostics.shadowRenderTargetsAllocated ?? 0) > 0;
  return {
    requested: Boolean(shadowOptions.enabled),
    observed,
    mapRendered,
    mapSampled: mapRendered && nativeShadowMapBindings > 0,
    mapSize: shadowOptions.size,
    label: shadowOptions.label,
    nativeShadowMapBindings,
    shadowRenderTargetsAllocated: diagnostics.shadowRenderTargetsAllocated ?? 0
  };
}

/**
 * M2 texture streaming observation (muse3jsparity-PRD): funds the
 * post-upgrade texture table (SDF label images + C1 upgrades) against the
 * budget with distance-prioritized residency. Empty table = nothing to fund.
 */
export function createProductionTexturesObservation(
  entries: readonly ProductionRuntimePrimitiveEntry[],
  cameraEye: AuraVec3,
  budgetBytes: number
): NonNullable<AuraRendererRuntimeObservation["textures"]> {
  const budget = normalizeTextureBudgetBytes(budgetBytes);
  const table = entries.flatMap((entry, entryIndex) => entry.resources
    .filter((resource) => resource.textureMipBytes.length > 0)
    .map((resource, resourceIndex) => {
      const position = entry.node.position ?? [0, 0, 0];
      return {
        id: `${entry.node.name ?? `primitive-${entryIndex}`}#${resourceIndex}`,
        mipBytesCoarseToFine: resource.textureMipBytes,
        distanceMeters: Math.hypot(
          cameraEye[0] - position[0], cameraEye[1] - position[1], cameraEye[2] - position[2])
      };
    }));
  if (table.length === 0) {
    return {
      budgetBytes: budget,
      usedBytes: 0,
      requestedBytes: 0,
      overBudget: false,
      overBudgetBytes: 0,
      residentEntries: 0,
      evictedEntries: []
    };
  }
  const residency = describeTextureStreamingResidency(table, budget);
  return {
    budgetBytes: budget,
    usedBytes: residency.usedBytes,
    requestedBytes: residency.requestedBytes,
    overBudget: residency.overBudget,
    overBudgetBytes: residency.overBudgetBytes,
    residentEntries: residency.residents.filter((resident) => resident.residentLevels > 0).length,
    evictedEntries: [...residency.evicted]
  };
}

export function createProductionRuntimePostprocessObservation(
  diagnostics: RenderDeviceDiagnostics
): AuraRendererRuntimeObservation["postprocess"] {
  const actualPasses = diagnostics.postprocessPassNames ?? [];
  const pixelBacked = actualPasses.length > 0 && diagnostics.lastError === null;
  return {
    renderPass: actualPasses.length > 0,
    outputPass: pixelBacked,
    bloomPass: actualPasses.includes("bloom"),
    ambientOcclusionPass: actualPasses.includes("ssao"),
    contactOcclusionReceiver: actualPasses.includes("contact-shadow"),
    pixelBacked,
    actualPasses,
    fallbackPasses: pixelBacked ? [] : ["direct-render"],
    targetFormat: diagnostics.postprocessTargetFormat,
    executionMode: diagnostics.postprocessPlan?.executionMode ?? "unknown"
  };
}

export function createProductionRuntimeCollectedLights(snapshot: AuraSceneSnapshot): readonly CollectedLight[] {
  const authoredLights = groups.flatten(snapshot.nodes).filter((node): node is AuraLightNode => node.kind === "light");
  const descriptors = authoredLights.flatMap((node, index) => createProductionRuntimeLightDescriptors(node, index));
  if (descriptors.length === 0) return createProductionRuntimeFallbackLights();

  const shadowCasterIndex = resolveProductionShadowCasterIndex(descriptors);
  return descriptors.map((descriptor, index) =>
    createProductionRuntimeCollectedLight(descriptor, index === shadowCasterIndex)
  );
}

/**
 * N1 caster selection (pure, unit-tested): an explicit `shadow: true`
 * request wins the single caster slot over unrequested lights; ties and
 * all-unrequested scenes keep the legacy priority-then-intensity order.
 */
export function resolveProductionShadowCasterIndex(
  descriptors: readonly {
    readonly shadowPriority: number;
    readonly shadowRequested: boolean;
    readonly shadowDisabled?: boolean;
    readonly intensity: number;
  }[]
): number {
  const explicitlyRequested = descriptors
    .map((descriptor, index) => ({ descriptor, index }))
    .filter(({ descriptor }) => descriptor.shadowRequested);
  // An authored false is scene-level opt-out when no light is explicitly
  // requested. Otherwise another unspecified light would silently take the
  // legacy caster slot and make `shadow: false` visually ineffective.
  if (explicitlyRequested.length === 0 && descriptors.some((descriptor) => descriptor.shadowDisabled === true)) {
    return -1;
  }
  const candidates = explicitlyRequested.length > 0
    ? explicitlyRequested
    : descriptors.map((descriptor, index) => ({ descriptor, index }));
  return candidates.reduce((selected, candidate) => {
    if (selected === undefined) return candidate;
    if (candidate.descriptor.shadowPriority !== selected.descriptor.shadowPriority) {
      return candidate.descriptor.shadowPriority > selected.descriptor.shadowPriority ? candidate : selected;
    }
    return candidate.descriptor.intensity > selected.descriptor.intensity ? candidate : selected;
  }, undefined as { readonly descriptor: typeof descriptors[number]; readonly index: number } | undefined)?.index ?? -1;
}

function createProductionRuntimeLightDescriptors(
  node: AuraLightNode,
  authoredIndex: number
): readonly ProductionRuntimeLightDescriptor[] {
  const name = node.name?.trim() || `aura-authored-${node.light}-${authoredIndex + 1}`;
  const color = colorToLinearRgb(node.color ?? "#ffffff");
  const intensity = nonNegativeFinite(node.intensity);
  const position = productionRuntimeLightPosition(node);
  const direction = productionRuntimeLightDirection(node, position);

  if (node.light === "ambient") {
    // CollectedLight intentionally represents direct lights only. Ambient light remains
    // environment-lighting intent and does not masquerade as a directional light.
    return [];
  }
  if (node.light === "directional") {
    return [{
      kind: "directional",
      name,
      color,
      intensity,
      position,
      direction,
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 3,
      shadowRequested: node.shadow === true,
      shadowDisabled: node.shadow === false,
      authoredLight: node.light
    }];
  }
  if (node.light === "point") {
    return [{
      kind: "point",
      name,
      color,
      intensity,
      position,
      direction,
      range: 10 * productionRuntimeLightMaxScale(node.scale),
      spotAngle: 0,
      penumbra: 0,
      shadowPriority: 1,
      shadowRequested: false,
      authoredLight: node.light
    }];
  }
  if (node.light === "studio") {
    return createProductionRuntimeStudioLightDescriptors(node, name, color, intensity, position);
  }
  if (node.light === "spot") {
    // N1 (muse3jsparity-PRD): authored spot with an explicit cone. The aim
    // target wins over lookAt; the direction feeds the B1 spot shadow path
    // and the A5 volumetric dominant-light selection.
    const spotTarget = node.target ?? node.lookAt ?? [0, 0.75, 0];
    return [{
      kind: "spot",
      name,
      color,
      intensity,
      position,
      direction: normalize3([spotTarget[0] - position[0], spotTarget[1] - position[1], spotTarget[2] - position[2]]),
      range: Math.max(1, node.distance ?? 12),
      spotAngle: clampNumber(node.angle ?? Math.PI / 6, 0.08, Math.PI / 2 - 0.01),
      penumbra: clampNumber(node.penumbra ?? 0.4, 0, 1),
      shadowPriority: 2,
      shadowRequested: node.shadow === true,
      shadowDisabled: node.shadow === false,
      authoredLight: node.light
    }];
  }

  const width = positiveFinite(node.width, node.light === "softbox" ? 2.4 : 2.2)
    * productionRuntimeLightAxisScale(node.scale, 0);
  const height = positiveFinite(node.height, node.light === "softbox" ? 1.6 : 1.2)
    * productionRuntimeLightAxisScale(node.scale, 1);
  const target = node.lookAt ?? [0, 0.75, 0];
  const targetDistance = Math.max(0.001, distance3(position, target));
  const halfDiagonal = Math.hypot(width, height) / 2;
  return [{
    kind: "spot",
    name: `${name}-${node.light}-spot-proxy`,
    color,
    intensity,
    position,
    direction,
    range: Math.max(1, targetDistance + halfDiagonal * 2),
    spotAngle: clampNumber(Math.atan2(halfDiagonal, targetDistance), 0.08, Math.PI / 2 - 0.01),
    penumbra: node.light === "softbox" ? 0.78 : 0.42,
    shadowPriority: 2,
    shadowRequested: false,
    authoredLight: node.light,
    authoredWidth: width,
    authoredHeight: height
  }];
}

function productionRuntimeLightPosition(node: AuraLightNode): AuraVec3 {
  const fallback: AuraVec3 =
    node.light === "directional" ? [3, 4, 3]
      : node.light === "point" ? [2, 2.5, 1.5]
        : node.light === "studio" ? [0, 3, 4]
          : node.light === "softbox" ? [-2.2, 2.4, 2.2]
            : node.light === "rect" ? [0, 2.6, 1.8]
              : [0, 0, 0];
  const position = node.position ?? fallback;
  return position.map((component, index) => Number.isFinite(component) ? component : fallback[index]) as unknown as AuraVec3;
}

export function productionRuntimeLightDirection(node: AuraLightNode, position: AuraVec3): AuraVec3 {
  if (node.lookAt) {
    const direction = normalizedDirection(position, node.lookAt);
    if (length3(direction) > 0) return direction;
  }
  if (node.rotation) {
    const matrix = rotationXYZ(node.rotation);
    return normalize3([-matrix[8]!, -matrix[9]!, -matrix[10]!]);
  }
  if (length3(position) > 0.000001) return normalize3([-position[0], -position[1], -position[2]]);
  return [0, -1, 0];
}

export function quaternionFromForwardDirection(direction: AuraVec3): readonly [number, number, number, number] {
  const target = normalize3(direction);
  const dot = clampNumber(-target[2], -1, 1);
  if (dot > 0.999999) return [0, 0, 0, 1];
  if (dot < -0.999999) return [0, 1, 0, 0];
  const quaternion: readonly [number, number, number, number] = [target[1], -target[0], 0, 1 + dot];
  const length = Math.hypot(...quaternion) || 1;
  return [
    quaternion[0] / length,
    quaternion[1] / length,
    quaternion[2] / length,
    quaternion[3] / length
  ];
}

export function normalizedDirection(from: AuraVec3, to: AuraVec3): AuraVec3 {
  const direction: AuraVec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  return length3(direction) > 0.000001 ? normalize3(direction) : [0, -1, 0];
}

function length3(value: AuraVec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function productionRuntimeLightMaxScale(scale: number | AuraVec3 | undefined): number {
  return Math.max(
    productionRuntimeLightAxisScale(scale, 0),
    productionRuntimeLightAxisScale(scale, 1),
    productionRuntimeLightAxisScale(scale, 2)
  );
}

function productionRuntimeLightAxisScale(scale: number | AuraVec3 | undefined, axis: 0 | 1 | 2): number {
  const value = typeof scale === "number" ? scale : scale?.[axis] ?? 1;
  return positiveFinite(Math.abs(value), 1);
}

export function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function productionRenderErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

export function normalizeSceneSnapshot(value: AuraSceneBuilder | AuraSceneSnapshot): AuraSceneSnapshot {
  return value instanceof AuraSceneBuilder ? value.toJSON() : value;
}
