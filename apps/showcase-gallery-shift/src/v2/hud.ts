// HUD objective/status lines — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import type { GalleryCtx } from "./state";

let hudCache = "";

export function wireGalleryHud(ctx: GalleryCtx, deps: { game: Game }) {
  const { game } = deps;
  function syncHud(): void {
    const snap = ctx.runtime.thief.snapshot();
    const guardState = ctx.runtime.guards.reduce<string>(
      (worst, guard) => {
        const order = { idle: 0, investigate: 1, alert: 2 } as const;
        return order[guard.state] > order[worst as keyof typeof order] ? guard.state : worst;
      },
      "idle"
    );
    const key = [
      ctx.runtime.layout.id, ctx.runtime.liftedIds.length, ctx.completedBeforeFloor, ctx.totalScore + ctx.runtime.floorScore,
      ctx.runtime.ghostRun, snap.gait, ctx.alarmActive, ctx.phase, ctx.paused, guardState,
      Math.round(ctx.runtime.detection.value * 100), snap.liftingPedestalId ?? "", Math.round(snap.liftProgress * 100)
    ].join("|");
    if (key === hudCache) return;
    hudCache = key;
    const totalLifted = ctx.completedBeforeFloor + ctx.runtime.liftedIds.length;
    game.hud.set("floor", `FLOOR ${ctx.runtime.layout.id} — ${ctx.runtime.layout.name.toUpperCase()}`);
    game.hud.set("exhibits", `EXHIBITS ${totalLifted} OF 3`);
    game.hud.set("score", `SCORE ${ctx.totalScore + ctx.runtime.floorScore}`);
    game.hud.set("detection", Math.min(1, ctx.runtime.detection.value));
    game.hud.set("guardState", `PATROL ${guardState.toUpperCase()}${snap.gait === "sneak" ? " · SNEAK" : ""}`);
    game.hud.set(
      "phase",
      ctx.paused
        ? "PAUSED — P TO RESUME"
        : ctx.phase === "caught"
          ? "CAUGHT — R TO RESTART"
          : ctx.phase === "won"
            ? "HEIST COMPLETE — R FOR ANOTHER RUN"
            : ctx.runtime.laserAlertRemaining > 0
              ? "LASER TRIP — FLOOR-WIDE ALERT"
              : ctx.runtime.liftedIds.length >= ctx.runtime.layout.pedestals.length
                ? ctx.alarmActive
                  ? "ALARM RUN — REACH THE EXIT"
                  : "FLOOR CLEAR — REACH THE EXIT"
                : snap.liftingPedestalId
                  ? `LIFTING ${snap.liftingPedestalId.toUpperCase()}`
                  : `LIFT ${totalLifted + 1} OF 3 — AVOID THE CONES`
    );
  }

  return { syncHud };
}
