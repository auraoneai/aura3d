// Presentation sync (character visuals / threat feedback / objective / cones) —
// extracted from boot.ts for 14-LOC.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import type { wireGalleryFx } from "./scene/fx";
import { cameraConeNodeId, flashlightNodeId, sightlineNodeId, threatNodeIds } from "./scene/world";
import { cameraYawAt } from "../gameplay/vision";
import type { GalleryCtx } from "./state";

type NodeHandle = AuraRuntimeNodeHandle | null;

export function wireGallerySync(ctx: GalleryCtx, deps: {
  game: Game;
  handle(id: string): NodeHandle;
  fx: ReturnType<typeof wireGalleryFx>;
  thiefHandle(): NodeHandle;
  guardHandle(id: string): NodeHandle;
  reducedMotion: boolean;
}) {
  const { game, handle, fx, thiefHandle, guardHandle, reducedMotion } = deps;
  const FACING_HALFLIFE = 0.08;
  
  function syncCharacterVisuals(): void {
    const snap = ctx.runtime.thief.snapshot();
    // Facing-yaw blend toward atan2(moveX, moveZ) — the wave-4 P0.
    const moveMagnitude = Math.hypot(snap.moveX, snap.moveZ);
    if (moveMagnitude > 0.05) {
      const targetYaw = Math.atan2(snap.moveX, snap.moveZ);
      const shortest = ((targetYaw - ctx.thiefFacingYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const blend = 1 - Math.exp(-Math.LN2 * (1 / 60) / FACING_HALFLIFE);
      ctx.thiefFacingYaw += shortest * blend;
      ctx.thiefYawErrorDeg = Math.abs(shortest) * (180 / Math.PI);
    } else {
      ctx.thiefYawErrorDeg = 0;
    }
    thiefHandle()?.setPosition(snap.x, 0, snap.z);
    thiefHandle()?.setRotation(0, ctx.thiefFacingYaw, 0);
    handle("infiltrator-identity-detail")?.setPosition(snap.x, 0, snap.z).setRotation(0, ctx.thiefFacingYaw, 0);
    handle("infiltrator-visor-signal")
      ?.setPosition(snap.x + Math.sin(ctx.thiefFacingYaw) * 0.19, 1.99, snap.z + Math.cos(ctx.thiefFacingYaw) * 0.19)
      .setRotation(0, ctx.thiefFacingYaw, 0);
    handle("thief-focus")?.setPosition(snap.x, 0.07, snap.z);
    handle("thief-contact-shadow")?.setPosition(snap.x, 0.018, snap.z);
    handle("v2-thief-practical")?.setPosition(snap.x, 1.25, snap.z);
    for (const guard of ctx.runtime.guards) {
      const h = guardHandle(guard.id);
      if (!h) continue;
      h.setPosition(guard.x, 0, guard.z);
      h.setRotation(0, guard.yaw + Math.PI, 0);
      handle(`${guard.id}-sentry-detail`)?.setPosition(guard.x, 1.1, guard.z).setRotation(0, guard.yaw + Math.PI, 0);
      handle(`${guard.id}-contact-shadow`)?.setPosition(guard.x, 0.018, guard.z);
      const ids = threatNodeIds(guard.id);
      handle(ids.ring)?.setPosition(guard.x, 0.11, guard.z);
      // Flashlight marker + its practical light ride ahead of the facing, with
      // the flashlight sway gated by reduced-motion.
      const sway = reducedMotion ? 0 : Math.sin(ctx.frameCount / 34 + (guard.id === "guard-1" ? 0 : 2)) * 0.18;
      const fx_ = guard.x + Math.sin(guard.yaw + sway) * 1.4;
      const fz = guard.z + Math.cos(guard.yaw + sway) * 1.4;
      handle(flashlightNodeId(guard.id))?.setPosition(fx_, 1.5, fz).setRotation(0, guard.yaw + sway, 0);
      handle(`v2-${guard.id}-flashlight`)?.setPosition(fx_, 1.8, fz);
      const preview = handle(sightlineNodeId(guard.id));
      preview?.setPosition(guard.x, 0.062, guard.z);
      preview?.setRotation(0, guard.yaw, 0);
      preview?.setScale([1.58, 1, 1]);
    }
  }
  
  function syncThreatFeedback(): void {
    const thief = ctx.runtime.thief.snapshot();
    const primarySeeingGuard = ctx.lastThreatSamples
      .filter((sample) => sample.seesThief)
      .reduce<(typeof ctx.lastThreatSamples)[number] | undefined>((nearest, sample) => {
        if (!nearest) return sample;
        return Math.hypot(sample.x - thief.x, sample.z - thief.z) < Math.hypot(nearest.x - thief.x, nearest.z - thief.z) ? sample : nearest;
      }, undefined);
    for (const sample of ctx.lastThreatSamples) {
      const ids = threatNodeIds(sample.id);
      const primarySighting = sample.seesThief && sample.id === primarySeeingGuard?.id;
      handle(ids.wedge)?.setVisible(primarySighting);
      handle(ids.beam)?.setVisible(primarySighting);
      handle(ids.line)?.setVisible(primarySighting);
      handle(ids.highlight)?.setVisible(primarySighting);
      handle(ids.source)?.setVisible(primarySighting);
      if (primarySighting) {
        const dx = thief.x - sample.x;
        const dz = thief.z - sample.z;
        const distance = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        const stretch = Math.min(1, Math.max(0.18, (distance - 0.42) / 4.6));
        handle(ids.wedge)?.setPosition(sample.x, 0.075, sample.z).setRotation(0, yaw, 0).setScale([1.5, 1, stretch]);
        handle(ids.beam)?.setPosition(sample.x, 0.19, sample.z).setRotation(0, yaw, 0).setScale([1.58, 1, stretch]);
        handle(ids.line)?.setPosition(sample.x, 0.08, sample.z).setRotation(0, yaw, 0).setScale([1.38, 1, stretch]);
        handle(ids.source)?.setPosition(sample.x, 0.17, sample.z).setScale([0.78, 0.78, 0.09]);
        handle(ids.highlight)?.setPosition(thief.x, 0.07, thief.z).setScale([1.18, 1.18, 0.09]);
      }
      // The passive cone hides while that guard holds a true sighting (the
      // alert wedge replaces it) — same rule as the legacy route.
      handle(sightlineNodeId(sample.id))?.setVisible(ctx.runtime.layout.id === 1 && !sample.seesThief);
    }
  }
  
  function syncObjective(): void {
    const thief = ctx.runtime.thief.snapshot();
    const unlifted = ctx.runtime.layout.pedestals.filter((pedestal) => !ctx.runtime.liftedIds.includes(pedestal.id));
    const objective = unlifted.length > 0
      ? unlifted.reduce((best, pedestal) =>
          Math.hypot(pedestal.x - thief.x, pedestal.z - thief.z) < Math.hypot(best.x - thief.x, best.z - thief.z) ? pedestal : best)
      : ctx.runtime.layout.exit;
    handle("live-objective-ring")?.setPosition(objective.x, 0.13, objective.z);
    handle("v2-objective-practical")?.setPosition(objective.x, 1.55, objective.z);
    const exiting = unlifted.length === 0;
    handle("live-lift-label")?.setVisible(!exiting);
    handle("live-exit-label")?.setVisible(exiting);
  }
  
  function syncCameraCones(): void {
    for (const cam of ctx.runtime.layout.cameras) {
      const yaw = cameraYawAt(cam, ctx.runtime.timeInFloor);
      handle(cameraConeNodeId(cam.id))?.setRotation(0, yaw, 0);
    }
  }

  return { syncCharacterVisuals, syncThreatFeedback, syncObjective, syncCameraCones };
}
