/**
 * PRD-10 §9.1/§9.2 — `prd10.world` frame contributor skeleton.
 *
 * Phases: `collect` (world item ordering), `background` (Path S world opaque
 * draws after EnvironmentBackgroundPass, order +10), `after-opaque`
 * (SceneCopyFallback, Phase 4), `transparent` (water, Phase 4). `opaque` and
 * `output` stay reserved to PRD 01.
 *
 * Draw path: always Path S (self-linked programs with
 * `a3d_prd10_world_light_fallback`) until a Path G item emitter exists — see
 * `worldDrawPath`.
 */
import { registerFrameContributor } from "@aura3d/rendering/contracts";
import type { FrameContributor, QrFlags } from "@aura3d/rendering/contracts";
import { programCacheSlot } from "@aura3d/rendering/contracts";
import { optInWorldFeatures, publishWorldFeatureState } from "./WorldFeatureState.js";
import { noteWorldPhase, terrainAfterOpaquePass, terrainBackgroundPass } from "./TerrainRuntime.js";
import { allWaterStates, waterAfterOpaquePasses, waterBackgroundPasses, waterTransparentPass, WORLD_BACKGROUND_PHASE_KEY } from "./WaterRuntime.js";
import { terrainRecordIds } from "../../agent-api/world/terrain.js";
import { timeOfDayRecords } from "../../agent-api/compiler/world.js";
import { worldSubflagOn } from "../../agent-api/world/flags.js";
import { advanceTimeOfDay } from "./TimeOfDayRuntime.js";
import { QUALITY_TIERS, type AuraQualityTier, type AuraQualityTierSettings } from "@aura3d/rendering/contracts";

/** Settings objects carry no tier name — recover it by identity/structural match. */
export const tierForSettings = (s: AuraQualityTierSettings): AuraQualityTier => {
  for (const [name, settings] of Object.entries(QUALITY_TIERS)) {
    if (settings === s || settings.drawBudget === s.drawBudget && settings.environmentSize === s.environmentSize) {
      return name as AuraQualityTier;
    }
  }
  return "high";
};

/**
 * World draw path. Path G (world draws as generated-program RenderItems) has
 * no emitter yet — nothing reads "G" — so returning it under
 * `A3D_QR_CORE=v2` made every terrain, water and grass draw vanish whenever
 * `core` was on (e.g. the `$ALL` arm). The Path S passes are correct on both
 * the legacy and the C-23 HDR output paths (#1111), so world always draws
 * through them until a Path G emitter lands; diagnostics keep listing the
 * Path G slots as pending.
 */
export function worldDrawPath(_flags: QrFlags): "S" | "G" {
  return "S";
}

/**
 * GU47 E-G (WP-7): `A3D_QR_WORLD_WATER` alone. The water handler compiles
 * under the sub-flag, but its passes rode the `prd10.world` contributor
 * (flag `A3D_QR_WORLD`), so water nodes compiled and never drew without the
 * whole world lane. This contributor emits the same water passes when the
 * world lane is off (it defers to `prd10.world` when it is on), and nothing
 * when no water body exists, so promoting the sub-flag leaves water-free
 * scenes without a pass. No `collect` phase: no per-frame item copy.
 */
export const WATER_ONLY_CONTRIBUTOR: FrameContributor = {
  id: "prd10.waterOnly",
  owner: "prd10",
  flag: "A3D_QR_WORLD_WATER",
  order: 10,
  phases: ["background", "after-opaque", "transparent"],
  passes(phase, ctx) {
    if (ctx.flags.on("A3D_QR_WORLD") || worldDrawPath(ctx.flags) !== "S") return [];
    if (allWaterStates().length === 0) return [];
    if (phase === "background") {
      ctx.blackboard.set(WORLD_BACKGROUND_PHASE_KEY, true);
      return waterBackgroundPasses(ctx);
    }
    if (phase === "after-opaque") return waterAfterOpaquePasses(ctx);
    if (phase === "transparent") return [waterTransparentPass(ctx)];
    return [];
  }
};

export function registerWorldFramePasses(): () => void {
  const releaseWaterOnly = registerFrameContributor(WATER_ONLY_CONTRIBUTOR);
  const releaseWorld = registerFrameContributor({
    id: "prd10.world",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    order: 10,
    phases: ["collect", "background", "after-opaque", "transparent"],
    collect(items, ctx) {
      noteWorldPhase("collect");
      ctx.blackboard.set("prd10.drawPath", worldDrawPath(ctx.flags));
      // T6.4 — advance every compiled time-of-day node; the blackboard record
      // carries this frame's rig, sun, practical scale and capture request
      // (uniform writes only, §6.7 — never a remount).
      if (worldSubflagOn(ctx.flags, "A3D_QR_WORLD_BIOME") && timeOfDayRecords.size > 0) {
        ctx.blackboard.set(
          "prd10.timeOfDay",
          advanceTimeOfDay(timeOfDayRecords, ctx.timeSeconds, tierForSettings(ctx.tier))
        );
      }
      // #1143 follow-up: generated-path wind/caustics get this frame's state,
      // and world-owned items opt in through their label prefix.
      return optInWorldFeatures(items, publishWorldFeatureState(ctx));
    },
    passes(phase, ctx) {
      noteWorldPhase(`${phase}:${worldDrawPath(ctx.flags)}`);
      // §9.1: world opaque draws land in `background` (after the environment
      // background pass) on Path S; Path G emits them as opaque RenderItems.
      // §9.1 order: planar reflections (waterBackgroundPasses, step 2) run
      // before the world opaque draw; `after-opaque` carries the scene copy
      // (step 5) and `transparent` the water surface (step 6).
      // T0-33: emit a world pass only when its content exists this frame —
      // unconditional terrain+water passes made `compilePlan` throw
      // (duplicate "color" writers / reads with no producer) on every Path S
      // frame, even with zero world nodes, and killed the frame loop.
      if (phase === "background" && worldDrawPath(ctx.flags) === "S") {
        // Lane 01 runs `background` only when an EnvironmentBackgroundPass
        // exists; record that it ran so later phases know which producers exist.
        ctx.blackboard.set(WORLD_BACKGROUND_PHASE_KEY, true);
        const passes = waterBackgroundPasses(ctx);
        return terrainRecordIds().length > 0 ? [...passes, terrainBackgroundPass(ctx)] : passes;
      }
      if (phase === "after-opaque" && worldDrawPath(ctx.flags) === "S") {
        // Colour-background frames skip `background`, so terrain draws here.
        const late = terrainRecordIds().length > 0 && ctx.blackboard.get(WORLD_BACKGROUND_PHASE_KEY) !== true
          ? [terrainAfterOpaquePass(ctx)]
          : [];
        return [...late, ...waterAfterOpaquePasses(ctx)];
      }
      if (phase === "transparent" && worldDrawPath(ctx.flags) === "S") {
        return allWaterStates().length > 0 ? [waterTransparentPass(ctx)] : [];
      }
      return [];
    },
    transparentItems() {
      return [];
    }
  });
  return () => {
    releaseWorld();
    releaseWaterOnly();
  };
}
