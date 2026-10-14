// HUD scoreboard — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import { ADRIFT_LIMIT_SECONDS } from "../gameplay/pod";
import type { GravityCtx } from "./state";
import { currentContract } from "./state";

let lastHudKey = "";

export function wireGravityHud(ctx: GravityCtx, deps: {
  game: Game;
  contract(): ReturnType<typeof currentContract>;
}) {
  const { game, contract } = deps;
  function syncHud(): void {
    const active = contract();
    const speed = Math.hypot(ctx.pod.kinematic.velocity[0], ctx.pod.kinematic.velocity[1]);
    const fuelPct = Math.round(ctx.pod.propellant);
    const adriftLeft = Math.max(0, Math.ceil(ADRIFT_LIMIT_SECONDS - ctx.pod.adriftSeconds));
    let status: string;
    if (ctx.shiftOver) status = "SHIFT OVER — press R to reset";
    else if (ctx.campaignComplete) status = "SHIFT COMPLETE — press R to fly again";
    else if (ctx.pod.state === "docked") status = "DELIVERED — press N for next dispatch";
    else if (ctx.pod.state === "lost") status = "HULL LOST — " + (ctx.lastFailReason ?? "route failure");
    else if (ctx.flyby.active) status = "FLYBY — any key to skip";
    else if (ctx.pod.state === "ready") status = ctx.aiming ? "RELEASE TO LAUNCH" : "DRAG TO AIM · ARROWS STEER · ENTER LAUNCH";
    else if (ctx.pod.propellant <= 0) status = "TANK DRY — ADRIFT " + adriftLeft + "s";
    else status = ctx.pod.correctionTokensRemaining > 0
      ? "COASTING — W/S CORRECT · SPACE WARP"
      : "COASTING — SPACE WARP";
    const key = [
      ctx.contractIndex, ctx.score, fuelPct, status,
      Math.round(speed * 100), ctx.pod.correctionTokensRemaining
    ].join("|");
    if (key === lastHudKey) return;
    lastHudKey = key;
    game.hud.set("contract", active.title.toUpperCase());
    game.hud.set("score", String(ctx.score));
    game.hud.set("fuel", fuelPct + "%");
    game.hud.set("status", status);
    game.hud.set("speed", speed.toFixed(2) + " u/s");
    game.hud.set("tokens", "✦".repeat(Math.max(0, ctx.pod.correctionTokensRemaining)) || "—");
  }

  return { syncHud };
}
