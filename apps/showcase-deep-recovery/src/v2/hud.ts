// HUD mission-stage text — extracted from boot.ts for 14-LOC.
import type { Game } from "@aura3d/game";
import { getDepthZone } from "../gameplay/reef";
import type { DeepAudioController } from "../legacy/deep-audio";
import type { DeepCtx } from "./state";

let lastHudKey = "";
const OBJECTIVES: Record<string, string> = {
  descent: "DESCEND TO 15 M · PULSE SONAR",
  "wreck-approach": "FOLLOW CYAN RETURNS TO THE WRECK",
  "standard-salvage": "GRAPPLE A BLUE STANDARD POD · BANK AT BUOY",
  "breach-repair": "REPAIR HULL AT BUOY (C)",
  "heavy-salvage": "RECOVER AN AMBER HEAVY POD · EXPECT DRAG",
  ascent: "ASCEND TO THE BUOY · SURFACE",
  "surface-complete": "RECOVERY COMPLETE",
  blackout: "LIFE SUPPORT DEPLETED"
};

export function wireDeepHud(ctx: DeepCtx, deps: {
  audio: DeepAudioController;
  game: Game;
}) {
  const { audio, game } = deps;
  function missionStage(): string {
    if (ctx.phase === "blackout") return "blackout";
    if (ctx.phase === "won") return "surface-complete";
    if (ctx.heavyBanked) return "ascent";
    if (ctx.oxygenState.breached || (ctx.standardBanked && ctx.repairCount === 0)) return "breach-repair";
    if (ctx.repairCount > 0) return "heavy-salvage";
    if (ctx.standardBanked) return "breach-repair";
    if (ctx.sonarState.pingCount > 0 && Math.abs(ctx.subState.y) >= 15) return "standard-salvage";
    if (ctx.sonarState.pingCount > 0 || Math.abs(ctx.subState.y) >= 12) return "wreck-approach";
    return "descent";
  }
  
  const OBJECTIVES: Record<string, string> = {
    descent: "DESCEND TO 15 M · PULSE SONAR",
    "wreck-approach": "FOLLOW CYAN RETURNS TO THE WRECK",
    "standard-salvage": "GRAPPLE A BLUE STANDARD POD · BANK AT BUOY",
    "breach-repair": "REPAIR HULL AT BUOY (C)",
    "heavy-salvage": "RECOVER AN AMBER HEAVY POD · EXPECT DRAG",
    ascent: "ASCEND TO THE BUOY · SURFACE",
    "surface-complete": "RECOVERY COMPLETE",
    blackout: "LIFE SUPPORT DEPLETED"
  };
  
  function syncHud(): void {
    const depth = Math.max(0, Math.round(-ctx.subState.y));
    const zone = getDepthZone(ctx.subState.y);
    const key = [
      ctx.phase, missionStage(), depth,
      Math.round(ctx.oxygenState.oxygen), Math.round(ctx.oxygenState.hull),
      ctx.bankedTotal, ctx.sonarState.contacts.length,
      ctx.oxygenState.breached ? 1 : 0, ctx.crates.filter((c) => c.tethered).length
    ].join("|");
    if (key === lastHudKey) return;
    lastHudKey = key;
    game.hud.set("objective", OBJECTIVES[missionStage()]);
    game.hud.set("depth", `${depth}m ${zone.name}`);
    game.hud.set("oxygen", Math.round(ctx.oxygenState.oxygen));
    game.hud.set("hull", Math.round(ctx.oxygenState.hull));
    game.hud.set("salvage", ctx.bankedTotal);
    game.hud.set("sonar", `${ctx.sonarState.contacts.length} RETURNS · ${Math.max(0, ctx.sonarState.pingCooldownRemaining).toFixed(1)}s`);
    const tethered = ctx.crates.filter((c) => c.tethered).length;
    game.hud.set(
      "message",
      ctx.phase === "blackout" ? "BLACKOUT — R TO RESET"
        : ctx.phase === "won" ? `RECOVERY COMPLETE — ${ctx.bankedTotal} CR`
        : ctx.phase === "paused" ? "PAUSED — P TO RESUME"
        : tethered > 0 ? `TETHERED ×${tethered} — F TO RELEASE · BANK AT BUOY`
        : ctx.oxygenState.breached ? "HULL BREACH — REPAIR AT BUOY (C)"
        : "W/S THRUST · A/D TURN · Q/E DEPTH · SPACE SONAR · F GRAPPLE"
    );
  }

  return { missionStage, syncHud };
}
