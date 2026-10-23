import type { AthleteRigPort } from "./rigPort";
import { buildAthleteNodes, resolveAthleteRig, updateAthleteRig, resolveAppearanceFromGlobal, type AthleteRigHandles, type ResolveAppearance } from "./athleteRig";

/** M-POSE rig behind the renderer's `AthleteRigPort` seam (pixel-identical to the live adapter's rig per aura-slam-pose-parity). */
export function createPoseRig(options: { resolveAppearance?: ResolveAppearance } = {}): AthleteRigPort<AthleteRigHandles> {
  const resolveAppearance = options.resolveAppearance ?? resolveAppearanceFromGlobal;
  const caches = { player: { lastKey: "" }, rival: { lastKey: "" } };
  return {
    build: (prefix, isPlayer) => buildAthleteNodes(prefix, isPlayer),
    resolve: (app, prefix) => resolveAthleteRig(app, prefix),
    update: (handles, actor, pose, ctx) =>
      updateAthleteRig(handles, actor, pose, ctx.isPlayer, ctx.isMoon, ctx.isPlayer ? caches.player : caches.rival, resolveAppearance)
  };
}
