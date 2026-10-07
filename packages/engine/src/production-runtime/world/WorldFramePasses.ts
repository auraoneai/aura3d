/**
 * PRD-10 §9.1/§9.2 — `prd10.world` frame contributor skeleton.
 *
 * Phases: `collect` (world item ordering), `background` (Path S world opaque
 * draws after EnvironmentBackgroundPass, order +10), `after-opaque`
 * (SceneCopyFallback, Phase 4), `transparent` (water, Phase 4). `opaque` and
 * `output` stay reserved to PRD 01.
 *
 * Draw path: Path G iff `programCacheSlot.provided && A3D_QR_CORE === "v2"`,
 * else Path S (self-linked programs with `a3d_prd10_world_light_fallback`).
 * Day 0: `collect` records the path on the blackboard; `passes` contributes
 * nothing until Phase 2.
 */
import { registerFrameContributor } from "@aura3d/rendering/contracts";
import type { QrFlags } from "@aura3d/rendering/contracts";
import { programCacheSlot } from "@aura3d/rendering/contracts";
import { terrainBackgroundPass } from "./TerrainRuntime.js";

export function worldDrawPath(flags: QrFlags): "S" | "G" {
  return programCacheSlot.provided && flags.values["A3D_QR_CORE"] === "v2" ? "G" : "S";
}

export function registerWorldFramePasses(): () => void {
  return registerFrameContributor({
    id: "prd10.world",
    owner: "prd10",
    flag: "A3D_QR_WORLD",
    order: 10,
    phases: ["collect", "background", "after-opaque", "transparent"],
    collect(items, ctx) {
      ctx.blackboard.set("prd10.drawPath", worldDrawPath(ctx.flags));
      return items;
    },
    passes(phase, ctx) {
      // §9.1: world opaque draws land in `background` (after the environment
      // background pass) on Path S; Path G emits them as opaque RenderItems.
      // `after-opaque` carries the SceneCopyFallback and `transparent` the
      // water surface once Phases 4+ land.
      if (phase === "background" && worldDrawPath(ctx.flags) === "S") {
        return [terrainBackgroundPass(ctx)];
      }
      return [];
    },
    transparentItems() {
      return [];
    }
  });
}
