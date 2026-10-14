// HUD sync — extracted from boot.ts for 14-LOC. Signature/cache unchanged.
import type { Game } from "@aura3d/game";
import type { PlayerState } from "../gameplay/player";
import { campaignStage } from "../gameplay/run";
import type { SwarmRunCtx } from "./state";

export function createSwarmHud(ctx: SwarmRunCtx, deps: { game: Game; player: PlayerState }) {
  const { game, player } = deps;
  let lastHudSignature = "";
  let lastHudWrite = 0;
  return function syncHud(): void {
    const signature = `${ctx.wave}|${ctx.score}|${ctx.combo}|${player.hp}|${Math.floor(ctx.burstCharge)}|${ctx.runState}`;
    if (signature === lastHudSignature && ctx.frame - lastHudWrite < 300) return;
    lastHudSignature = signature;
    lastHudWrite = ctx.frame;
    game.hud.set("wave", ctx.runState === "intermission" ? `W${ctx.wave} CLEAR` : `W${Math.max(1, ctx.wave)} ${campaignStage(Math.max(1, ctx.wave)).toUpperCase()}`);
    game.hud.set("score", `${ctx.score}`);
    game.hud.set("combo", ctx.combo > 1 ? `x${ctx.combo}` : "");
    game.hud.set("hp", `HP ${"▮".repeat(Math.max(0, player.hp))}${"▯".repeat(Math.max(0, player.maxHp - player.hp))}`);
    game.hud.set("burst", ctx.burstCharge >= 100 ? "BURST READY (Space)" : `BURST ${Math.floor(ctx.burstCharge)}%`);
  };
}
