// HUD sync — extracted from boot.ts for 14-LOC. hudCache lives in the closure.
import type { BoutSnapshot } from "../gameplay/arena/mech-fight";
import type { createMechBout } from "../gameplay/arena/mech-fight";
import type { createHangarController } from "../legacy/hangar";
import type { Game } from "@aura3d/game";

export function createMechHud(deps: {
  game: Game;
  hangar: ReturnType<typeof createHangarController>;
  getMode(): "hangar" | "arena";
  getBout(): ReturnType<typeof createMechBout> | null;
  getBoutIndex(): number;
}) {
  let hudCache = "";
  return function syncHud(snap: BoutSnapshot | null): void {
    const { game, hangar } = deps;
    const mode = deps.getMode();
    const bout = deps.getBout();
    const boutIndex = deps.getBoutIndex();
    const stats = bout?.stats();
    const key = JSON.stringify({
      m: mode,
      p: snap?.phase,
      ph: snap ? Math.round((snap.player.hp / (stats?.player.hpMax ?? 1)) * 100) : 0,
      rh: snap ? Math.round((snap.rival.hp / (stats?.rival.hpMax ?? 1)) * 100) : 0,
      g: snap ? Math.round((snap.player.guard / (stats?.player.guardMax ?? 1)) * 100) : 0,
      w: snap ? Math.round((snap.player.power / (stats?.player.powerMax ?? 1)) * 100) : 0,
      l: hangar.snapshot().locked
    });
    if (key === hudCache) return;
    hudCache = key;
    game.hud.set("mode", mode === "hangar" ? `HANGAR ${hangar.snapshot().activeSlot.toUpperCase()}` : "PIT");
    game.hud.set("hp", snap && stats ? snap.player.hp / stats.player.hpMax : 0);
    game.hud.set("rival", snap && stats ? snap.rival.hp / stats.rival.hpMax : 0);
    game.hud.set("guard", snap && stats ? snap.player.guard / stats.player.guardMax : 0);
    game.hud.set("power", snap && stats ? snap.player.power / stats.player.powerMax : 0);
    game.hud.set(
      "phase",
      snap ? `${snap.phase.toUpperCase()} ${boutIndex + 1}` : mode === "hangar" ? "ASSEMBLY" : "—"
    );
  };
}
