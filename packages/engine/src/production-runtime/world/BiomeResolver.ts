/**
 * PRD-10 §6.3 / T6.1 — BiomeResolver.
 *
 * Registers the lane's two C-09 environment sources:
 * - `prd10.biome` (priority 300): a `biome` node (world.biome or
 *   environments.outdoor/room/space/underwater → `scope:"environment"`) or the
 *   §6.3 default-biome rules when the scene has a world signal.
 * - `prd10.timeOfDay` (priority 250): the `time-of-day` node's keyframe rig at
 *   its declared hour.
 *
 * Every resolution returns `ambient: null` and IBL intensity > 0 — the
 * ambient-zeroes-IBL branch (L2) is unreachable for a biome scene. Explicit
 * PRD 02 environments (400) still win (§7.1.2).
 *
 * §6.3 category rows ("space" → space, "city-night" → night-city, …) read the
 * scene's `AuraSceneCategory`, which `AuraSceneSnapshot` does not carry — the
 * category signal binds at the app seam, not here. `defaultBiomeId` accepts it
 * as an explicit parameter so the rule set is complete and testable; the
 * resolver passes the snapshot-observable signals only.
 */
import { registerEnvironmentSource, type AuraEnvironmentSourceResolution } from "../../contracts/environment.js";
import type { AuraSceneSnapshot } from "../../agent-api/index.js";
import type { AuraSceneCategory } from "../../agent-api/index.js";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { AuraBiomeId } from "../../contracts/world.js";
import {
  applyBiomeOverrides,
  describeBiome,
  type AuraBiomeEnvironmentSpec,
  type AuraBiomeNode,
  type AuraBiomeRigDetail,
  type AuraTimeOfDayNode
} from "../../agent-api/world/biomes.js";
import { resolveTiered } from "../../agent-api/world/biomes.js";
import { rigAtHour } from "../../agent-api/world/timeOfDay.js";

type Kind = AuraSceneSnapshot["nodes"][number];

const findNodes = (snapshot: AuraSceneSnapshot, kind: string): Kind[] =>
  snapshot.nodes.filter((n) => (n as { kind?: string }).kind === kind);

/** §6.3 default-biome rules, evaluated over observable scene signals. `null` = no biome (lower-priority sources apply). */
export function defaultBiomeId(signals: {
  readonly hasTerrain?: boolean;
  readonly hasLakeOrOceanWater?: boolean;
  readonly hasRoom?: boolean;
  readonly category?: AuraSceneCategory;
}): AuraBiomeId | null {
  if (signals.hasTerrain || signals.hasLakeOrOceanWater) return "outdoor-day";
  if (signals.hasRoom) return "interior-neutral";
  switch (signals.category) {
    case "space": return "space";
    case "city-night":
    case "neon": return "night-city";
    case "city-day": return "outdoor-day";
    case "product":
    case "material": return null; // §6.3: no biome — lower-priority sources apply
    default: return "interior-neutral"; // never a void, never zero IBL
  }
}

const isLakeOrOcean = (n: Kind): boolean => {
  const kind = (n as { options?: { kind?: string } }).options?.kind;
  return kind === "ocean" || kind === "lake";
};

/** Signals observable from a bare `AuraSceneSnapshot` (no category field exists on it). */
export function sceneSignals(snapshot: AuraSceneSnapshot): {
  hasTerrain: boolean; hasLakeOrOceanWater: boolean; hasRoom: boolean;
} {
  return {
    hasTerrain: findNodes(snapshot, "terrain").length > 0,
    hasLakeOrOceanWater: findNodes(snapshot, "water").some(isLakeOrOcean),
    // world.room emits `room-*` named walls/floor; marker check keeps the rule honest
    hasRoom: snapshot.nodes.some((n) => (n as { name?: string }).name?.startsWith("room-") === true)
  };
}

/** `AuraBiomeEnvironmentSpec` → C-09 resolution probe field. */
export function probeFor(
  spec: AuraBiomeEnvironmentSpec,
  tier: AuraQualityTier
): AuraEnvironmentSourceResolution["probe"] {
  switch (spec.source) {
    case "sky-capture":
      return {
        capture: {
          include: "sky-only",
          resolution: resolveTiered(spec.faceSize, tier),
          update: "once"
        }
      };
    case "hdri":
      return { hdri: spec.hdri.url };
    case "room":
      // C-09 union has no room member — a procedural room capture is `include:"all"`.
      // Reported via diagnostics.environment; Q-02-2 asks PRD 02 to accept prd10 captures.
      return { capture: { include: "all", resolution: 128, update: "once" } };
    case "space-bake":
      return { spaceBake: "world/space-default" };
  }
}

/** Rig → C-09 resolution. `ambient: null` + IBL > 0 on every path (§6.3 ibl-only). */
export function resolutionFor(
  rig: AuraBiomeRigDetail,
  tier: AuraQualityTier
): AuraEnvironmentSourceResolution {
  const spec = rig.environmentSpec;
  const intensity = spec.intensity;
  return {
    kind: "biome",
    probe: probeFor(spec, tier),
    intensity,
    diffuseIntensity: intensity,
    specularIntensity: intensity,
    rotation: spec.source === "hdri" ? spec.rotationDeg * (Math.PI / 180) : 0,
    // a biome always draws a background: sky model for sky rigs, bake/gradient otherwise
    background: rig.sky !== null || spec.source === "space-bake"
      ? { visible: true, blurriness: 0, intensity, rotation: 0 }
      : false,
    ambient: null
  };
}

const biomeNodeOf = (n: Kind): AuraBiomeNode | null =>
  (n as { kind?: string }).kind === "biome" ? (n as unknown as AuraBiomeNode) : null;

/**
 * Install both sources. Called from `lanes/prd10.ts` — registered
 * unconditionally; the environmentSources registry gates them on the flag.
 */
export function registerBiomeSources(): () => void {
  // §13: `_BIOME` is the declared gate for these sources. The registry checks
  // `flags.on(entry.flag)` only, so §13's "on by default under A3D_QR_WORLD"
  // needs parent→sub propagation in `resolveQrFlags` — filed as Q-15-6; until
  // it lands, callers opt in with `world.biome`/`A3D_QR_WORLD_BIOME=1` (the
  // same semantics as every other sub-flag, e.g. `post.taa` in C-00).
  const offBiome = registerEnvironmentSource({
    id: "prd10.biome",
    owner: "prd10",
    flag: "A3D_QR_WORLD_BIOME",
    priority: 300,
    resolve(snapshot, tier) {
      const biomeNodes = findNodes(snapshot, "biome").map(biomeNodeOf);
      if (biomeNodes.length > 0) {
        const node = biomeNodes[0]!; // highest-priority match is scene order (deterministic)
        const rig = applyBiomeOverrides(describeBiome(node.biome), node.overrides);
        return resolutionFor(rig, tier);
      }
      // Q-15-6: no world signal → no resolution. Once #266 propagates parent
      // flags to sub-flags, an always-resolving source would replace the
      // environment of EVERY all-flags scene with `interior-neutral` (whose
      // HDRIs are pending admission). The §6.3 "never a void" rule applies to
      // world scenes only; scenes without terrain, water or room nodes fall
      // through to lower-priority sources.
      const signals = sceneSignals(snapshot);
      const hasWorldSignal =
        signals.hasTerrain ||
        signals.hasLakeOrOceanWater ||
        signals.hasRoom ||
        findNodes(snapshot, "water").length > 0;
      if (!hasWorldSignal) return undefined;
      const id = defaultBiomeId(signals) ?? "interior-neutral";
      return resolutionFor(describeBiome(id), tier);
    }
  });
  const offTimeOfDay = registerEnvironmentSource({
    id: "prd10.timeOfDay",
    owner: "prd10",
    flag: "A3D_QR_WORLD_BIOME",
    priority: 250,
    resolve(snapshot, tier) {
      const tod = findNodes(snapshot, "time-of-day")[0] as unknown as AuraTimeOfDayNode | undefined;
      if (!tod) return undefined;
      const rig = rigAtHour(tod.options, tod.options.hour);
      return resolutionFor(rig, tier);
    }
  });
  return () => {
    offBiome();
    offTimeOfDay();
  };
}
