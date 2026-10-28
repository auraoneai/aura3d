// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraRendererRuntimeObservation, AuraSceneSnapshot, AuraVec3 } from "../nodes/types.js";
import { resolveProductionRuntimeShadowTuning } from "../compiler/observations.js";
import { groups } from "../nodes/groups.js";
import { mediaMatches } from "../platform.js";
import { resolveRendererSceneCategory } from "../rendererDiagnostics.js";
import { createSpotShadowProjection, resolveShadowPcfTapTier, selectSpotShadowAtlasTier, type CollectedLight, type RendererShadowOptions, type ShadowPcfTapTier, type ShadowPcfTapTierDecision } from "@aura3d/rendering";
import { collectPrd02Lights, prd02LightingOn, readLightingKillSwitches, resolveLightingTier, selectShadowedLights, type Prd02LightingKillSwitches } from "./lights.js";

/** PRD-02 flag path returns a RendererShadowOptions-shaped view of the
 *  resolved `ShadowSystemConfig` plus the config itself on `prd02Shadows`
 *  (additive member; legacy consumers ignore it). */
export interface Prd02ShadowOptions extends RendererShadowOptions {
  readonly prd02Shadows?: ShadowSystemConfig;
  /** `effects.contactShadows()` opt-in consumed by the prd02.contactShadows
   *  contributor (PRD-02 §6.5; additive member, legacy consumers ignore it). */
  readonly prd02Contact?: {
    readonly length?: number;
    readonly thickness?: number;
    readonly steps?: number;
    readonly intensity?: number;
    readonly lights?: "sun" | "shadowed";
  };
  /** `?a3dLighting=` kill switches resolved at compile (PRD-02 §6.5). */
  readonly prd02KillSwitches?: Prd02LightingKillSwitches;
}

export function createProductionRuntimeShadowOptions(
  snapshot: AuraSceneSnapshot,
  collectedLights: readonly CollectedLight[],
  flags?: { on(name: string): boolean }
): RendererShadowOptions {
  // T0-28: callers with an app-resolved QrFlags pass it (see qr-request);
  // the ambient URL/env resolution inside prd02LightingOn is the fallback.
  if (prd02LightingOn(flags)) return createPrd02ShadowOptions(snapshot);
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

// ---------- PRD-02 §6.4 — flag-path shadow system config ----------

import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import { QUALITY_TIERS } from "@aura3d/rendering/contracts";

/** Renderer-facing shadow config produced under A3D_QR_LIGHTING (PRD-02 §6.4). */
export interface ShadowSystemConfig {
  readonly enabled: boolean;
  /** Per-cascade/local map size — the C-27 tier value (default) or a per-light override. */
  readonly mapSize: 1024 | 2048 | 4096;
  /** Cascade count: "auto" resolves to 1 when scene radius ≤ 15 m, else the tier value. */
  readonly cascades: 1 | 2 | 3 | 4;
  readonly maxDistance: number;              // min(camera.far, 150)
  readonly splitLambda: number;              // 0.75 practical split
  readonly blend: number;                    // 0.1 cascade blend band
  readonly filter: "hard" | "pcf" | "pcss" | "castano" | "vogel";
  /** Hard removal fraction in full shadow — 1.0 under the flag (E-category fix). */
  readonly strength: number;
  /** Normalized constant bias; 0 = auto. */
  readonly bias: number;
  /** World-space normal offset = 1.5 × texel world size. */
  readonly normalBias: number;
  readonly sceneRadius: number;
  /** PCF tap-count cap (PRD-2 WP-3): 32 keeps the authored kernel, 16 / 8 reduce it. Undefined = `resolveShadowPcfTapTier` default. */
  readonly pcfTapTier?: ShadowPcfTapTier;
  /** Why `pcfTapTier` was chosen (diagnostics). */
  readonly pcfTapReason?: ShadowPcfTapTierDecision["reason"];
}

const FILTER_BY_TIER: Readonly<Record<"pcf2" | "pcf3" | "pcf5", ShadowSystemConfig["filter"]>> = {
  pcf2: "hard",
  pcf3: "castano",
  pcf5: "vogel"
};

/**
 * Shadow-casting instances at or above which an "auto" cascade count is capped at two. Every cascade redraws every caster, so a scene
 * that stamps this many shadow-casting instances (the 18,000-instance forest benchmark) pays for the third pass in every frame while
 * the far cascade's texel density is already coarse; two cascades keep the near range sharp. An explicit `shadow.cascades` is never capped,
 * and `globalThis.__A3D_DENSE_SHADOWS__ = "off"` (or `?denseshadows=off`, see `denseShadowBudgetEnabled`) restores the tier value.
 */
export const DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES = 8192;

export function denseShadowBudgetEnabled(): boolean {
  const g = globalThis as { __A3D_DENSE_SHADOWS__?: string; location?: { search?: string } };
  let value = g.__A3D_DENSE_SHADOWS__;
  try {
    const q = typeof g.location?.search === "string" ? new URLSearchParams(g.location.search).get("denseshadows") : null;
    if (q === "on" || q === "off") value = q;
  } catch {
    // no location (node, workers): fall through to the global
  }
  return value !== "off";
}

/**
 * Explicit PCF tap tier from `globalThis.__A3D_SHADOW_TAPS__` or `?shadowtaps=32|16|8` (URL wins); anything else is ignored.
 * Overrides the quality-tier and dense-scene defaults, for A/B runs and authors who want a fixed tier.
 */
export function shadowTapTierOverride(): ShadowPcfTapTier | undefined {
  const g = globalThis as { __A3D_SHADOW_TAPS__?: unknown; location?: { search?: string } };
  let value: unknown = g.__A3D_SHADOW_TAPS__;
  try {
    const q = typeof g.location?.search === "string" ? new URLSearchParams(g.location.search).get("shadowtaps") : null;
    if (q !== null) value = q;
  } catch {
    // no location (node, workers): fall through to the global
  }
  const n = typeof value === "string" ? Number(value) : value;
  return n === 32 || n === 16 || n === 8 ? n : undefined;
}

/**
 * Opt-in for the dense-scene PCF default (8 taps from DENSE_SHADOW_CASTER_INSTANCES casters): `globalThis.__A3D_DENSE_SHADOW_TAPS__ = "on"`
 * or `?densetaps=on` (URL wins). Off by default: the 8-tap kernel moved the 18,000-instance forest by 2% (inside run-to-run noise) and
 * changed pixels by up to 9/255 in the interior (evidence/forest-10k/shadow-tier/README.md), so it stays opt-in until a scene needs it.
 */
export function denseShadowTapTierEnabled(): boolean {
  const g = globalThis as { __A3D_DENSE_SHADOW_TAPS__?: string; location?: { search?: string } };
  let value = g.__A3D_DENSE_SHADOW_TAPS__;
  try {
    const q = typeof g.location?.search === "string" ? new URLSearchParams(g.location.search).get("densetaps") : null;
    if (q === "on" || q === "off") value = q;
  } catch {
    // no location (node, workers): fall through to the global
  }
  return value === "on";
}

/** Total instances across shadow-casting instanced primitive nodes (nodes parked at y <= -50 excluded, like the scene radius). */
export function shadowCastingInstanceCount(snapshot: AuraSceneSnapshot): number {
  let total = 0;
  for (const node of groups.flatten(snapshot.nodes)) {
    if (node.kind !== "primitive" || !node.castShadow || !Array.isArray(node.instances)) continue;
    const position: AuraVec3 = Array.isArray(node.position) ? node.position : [0, 0, 0];
    if (position[1] <= -50) continue;
    total += node.instances.length;
  }
  return total;
}

/**
 * Scene-bounds radius for shadow sizing. Nodes parked at y ≤ -50 (the
 * offstage convention) do not count — the map size must not grow because
 * an agent parked something far below the stage (PRD-02 §6.4 test).
 */
export function sceneShadowRadius(snapshot: AuraSceneSnapshot): number {
  const nodes = groups.flatten(snapshot.nodes);
  return nodes.reduce((radius, node) => {
    const position: AuraVec3 = "position" in node && Array.isArray(node.position) ? node.position : [0, 0, 0];
    if (position[1] <= -50) return radius;
    const nodeScale = "scale" in node ? node.scale : undefined;
    const scale = typeof nodeScale === "number"
      ? Math.abs(nodeScale)
      : Array.isArray(nodeScale) ? Math.max(...nodeScale.map(Math.abs)) : 1;
    return Math.max(radius, Math.hypot(...position) + scale);
  }, 1);
}

/**
 * Flag-path shadow config (PRD-02 §6.4): strength 1.0 for every category,
 * size from the C-27 tier (`QUALITY_TIERS[tier].shadow`), "auto" cascades
 * (1 when scene radius ≤ 15 m), maxDistance = min(camera.far, 150),
 * lambda 0.75, bias 0, normalBias = 1.5 × texelWorld.
 */
export function resolveShadowSystemConfig(
  snapshot: AuraSceneSnapshot,
  descriptors: readonly { readonly shadowRequested: boolean; readonly shadowDisabled?: boolean; readonly shadowOptions?: { readonly cascades?: number | "auto"; readonly maxDistance?: number; readonly splitLambda?: number; readonly blend?: number; readonly mapSize?: number; readonly filter?: "hard" | "pcf" | "pcss"; readonly bias?: number; readonly normalBias?: number } }[],
  tier: AuraQualityTier,
  options: { readonly cameraFar?: number } = {}
): ShadowSystemConfig {
  const settings = QUALITY_TIERS[tier];
  const radius = sceneShadowRadius(snapshot);
  const sunOptions = descriptors.find((d) => d.shadowRequested && !d.shadowDisabled)?.shadowOptions;
  const cascadesOpt = sunOptions?.cascades;
  const denseBudget = denseShadowBudgetEnabled();
  const allCasterInstances = denseBudget ? shadowCastingInstanceCount(snapshot) : 0;
  const casterInstances = (cascadesOpt === undefined || cascadesOpt === "auto") && denseBudget ? allCasterInstances : 0;
  const dense = casterInstances >= DENSE_INSTANCED_CASTER_CASCADE_CAP_INSTANCES && settings.shadow.cascades > 2 && radius > 15;
  // Evidence for audits (tests/browser/shadow-proxy-ab.spec.ts): this page's cascade count was capped by the dense-instance budget.
  if (dense) (globalThis as { __A3D_DENSE_SHADOW_CAP__?: unknown }).__A3D_DENSE_SHADOW_CAP__ = { instances: casterInstances, tierCascades: settings.shadow.cascades, cascades: 2 };
  const cascades = (cascadesOpt === undefined || cascadesOpt === "auto")
    ? (radius <= 15 ? 1 : (dense ? (Math.min(settings.shadow.cascades, 2) as 1 | 2 | 3 | 4) : settings.shadow.cascades))
    : (cascadesOpt as 1 | 2 | 3 | 4);
  const mapSize = (sunOptions?.mapSize ?? settings.shadow.mapSize) as 1024 | 2048 | 4096;
  const tapTier = resolveShadowPcfTapTier({ quality: tier, casterInstances: allCasterInstances, requested: shadowTapTierOverride(), denseDefault: denseShadowTapTierEnabled() });
  // Evidence for audits and the remote A/B (tests/browser/shadow-filter-tier-ab.spec.ts): the tap tier this page resolved.
  (globalThis as { __A3D_SHADOW_TAP_TIER__?: unknown }).__A3D_SHADOW_TAP_TIER__ = { tier: tapTier.tier, reason: tapTier.reason, casterInstances: allCasterInstances, quality: tier };
  const texelWorld = (radius * 2) / mapSize;
  const enabled = descriptors.some((d) => d.shadowRequested && !d.shadowDisabled);
  return {
    enabled,
    mapSize,
    cascades,
    maxDistance: Math.min(options.cameraFar ?? 150, sunOptions?.maxDistance ?? 150),
    splitLambda: sunOptions?.splitLambda ?? 0.75,
    blend: sunOptions?.blend ?? 0.1,
    filter: sunOptions?.filter === "pcss" ? "pcss" : FILTER_BY_TIER[settings.shadow.filter],
    strength: 1.0,
    bias: sunOptions?.bias ?? 0,
    normalBias: sunOptions?.normalBias ?? 1.5 * texelWorld,
    sceneRadius: radius,
    pcfTapTier: tapTier.tier,
    pcfTapReason: tapTier.reason
  };
}

/**
 * `lighting.quality: "auto"` resolves through the C-27 stub (PRD-02 §6.8):
 * "high" on desktop, "medium" on coarse pointers. The real compile-context
 * quality arrives via `resolveLightingTier` once C-36 ctx wiring lands.
 */
export function prd02ResolveTier(requested: AuraQualityTier | "auto" | undefined): AuraQualityTier {
  if (requested && requested !== "auto") return requested;
  const coarse = mediaMatches("(pointer: coarse)");
  return resolveLightingTier(undefined, { quality: { tier: coarse ? "medium" : "high" } });
}

/**
 * Flag-path shadow options (PRD-02 §6.4): `collectPrd02Lights` →
 * `selectShadowedLights` (explicit shadow first, autoSun promotes one
 * directional, max = 1 sun + tier localShadowLights) →
 * `resolveShadowSystemConfig` (strength 1.0, C-27 map size, bias 0, normalBias
 * auto). Legacy `resolveProductionShadowCasterIndex` /
 * `resolveProductionRuntimeShadowTuning` are not consulted on this path.
 */
export function createPrd02ShadowOptions(
  snapshot: AuraSceneSnapshot,
  options: { readonly tier?: AuraQualityTier | "auto"; readonly cameraFar?: number } = {}
): Prd02ShadowOptions {
  const tier = prd02ResolveTier(options.tier);
  const collected = collectPrd02Lights(snapshot);
  const selection = selectShadowedLights(collected.descriptors, {
    autoSunShadow: true,
    max: 1 + QUALITY_TIERS[tier].shadow.localShadowLights
  });
  const config = resolveShadowSystemConfig(snapshot, collected.descriptors, tier, { cameraFar: options.cameraFar });
  const contactNode = groups.flatten(snapshot.nodes).find(
    (node) => node.kind === "effect" && (node.effect as string) === "contact-shadows"
  );
  const contactRequest = contactNode && "contactShadows" in contactNode
    ? (contactNode as { readonly contactShadows?: Prd02ShadowOptions["prd02Contact"] }).contactShadows
    : undefined;
  return {
    enabled: config.enabled && selection.casters.length > 0,
    size: config.mapSize,
    strength: config.strength,
    bias: config.bias,
    filter: "pcf",
    cascadeCount: config.cascades,
    cascadeLambda: config.splitLambda,
    label: `aura3d-prd02-${tier}-${config.mapSize}px-${config.cascades}casc-shadow-map`,
    prd02Shadows: config,
    ...(contactRequest ? { prd02Contact: contactRequest } : {}),
    prd02KillSwitches: readLightingKillSwitches()
  };
}
