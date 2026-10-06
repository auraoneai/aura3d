// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraRendererRuntimeObservation, AuraSceneSnapshot, AuraVec3 } from "../nodes/types.js";
import { resolveProductionRuntimeShadowTuning } from "../compiler/observations.js";
import { groups } from "../nodes/groups.js";
import { resolveRendererSceneCategory } from "../rendererDiagnostics.js";
import { createSpotShadowProjection, selectSpotShadowAtlasTier, type CollectedLight, type RendererShadowOptions } from "@aura3d/rendering";

export function createProductionRuntimeShadowOptions(
  snapshot: AuraSceneSnapshot,
  collectedLights: readonly CollectedLight[]
): RendererShadowOptions {
  const nodes = groups.flatten(snapshot.nodes);
  const names = nodes.map((node) => "name" in node ? node.name?.toLowerCase() ?? "" : "");
  const category = resolveRendererSceneCategory(snapshot, names);
  const sceneRadius = nodes.reduce((radius, node) => {
    const position: AuraVec3 = "position" in node && Array.isArray(node.position)
      ? node.position
      : [0, 0, 0];
    const nodeScale = "scale" in node ? node.scale : undefined;
    const scale = typeof nodeScale === "number"
      ? Math.abs(nodeScale)
      : Array.isArray(nodeScale) ? Math.max(...nodeScale.map(Math.abs)) : 1;
    return Math.max(radius, Math.hypot(...position) + scale);
  }, 1);
  const shadowCaster = collectedLights.find((light) => light.castsShadow);
  const size = sceneRadius > 30 ? 4096 : sceneRadius > 10 ? 2048 : 1024;
  const tuning = resolveProductionRuntimeShadowTuning(shadowCaster?.kind, size, sceneRadius);
  return {
    enabled: Boolean(shadowCaster),
    size,
    ...tuning,
    strength: category === "city-day" ? 0.38
      : category === "material" || category === "product" ? 0.24
        : 0.32,
    pcfRadius: size >= 2048 ? 1.5 : 1.2,
    pcfSamples: size >= 2048 ? 16 : 9,
    filter: "pcf",
    label: `aura3d-root-production-${category}-${size}px-shadow-map`
  };
}

export function describeProductionSpotShadow(input: {
  readonly requested: boolean;
  readonly casterIsSpot: boolean;
  readonly casterName?: string;
  readonly angle?: number;
  readonly penumbra?: number;
  readonly range?: number;
  readonly mapRendered: boolean;
  readonly mapSampled: boolean;
}): NonNullable<AuraRendererRuntimeObservation["shadow"]>["spot"] {
  if (!input.requested || !input.casterIsSpot || input.angle === undefined) {
    return {
      requested: input.requested,
      casterIsSpot: input.casterIsSpot,
      ...(input.casterName === undefined ? {} : { casterName: input.casterName }),
      spotPixelBacked: false,
      reason: !input.requested
        ? "no authored spot requested a shadow map"
        : !input.casterIsSpot
          ? "shadow requested but the caster slot went to a non-spot light"
          : "spot caster has no cone description"
    };
  }
  // Tier selection validates the cone fail-closed (RangeError on bad angle);
  // the full projection matrix composes in-device from this cone + range.
  const tier = selectSpotShadowAtlasTier(input.angle);
  createSpotShadowProjection(input.angle, Math.max(1, input.range ?? 12));
  const backed = input.mapRendered && input.mapSampled;
  return {
    requested: true,
    casterIsSpot: true,
    ...(input.casterName === undefined ? {} : { casterName: input.casterName }),
    angle: input.angle,
    ...(input.penumbra === undefined ? {} : { penumbra: input.penumbra }),
    range: Math.max(1, input.range ?? 12),
    atlasResolution: tier.resolution,
    atlasReason: tier.reason,
    spotPixelBacked: backed,
    reason: backed
      ? `spot shadow map rendered and sampled (${tier.resolution}px ${tier.reason})`
      : "spot caster selected but the device shows no rendered+sampled shadow map yet"
  };
}
