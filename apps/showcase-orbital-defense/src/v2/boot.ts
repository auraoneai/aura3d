// apps/showcase-orbital-defense/src/v2/boot.ts — T1.10 v2 entry stub (T2.x fills the scene).
import { createGame } from "@aura3d/game";

const ROUTE_FLAG = "A3D_QR_ROUTE_ORBITAL_DEFENSE" as const;

const target = document.getElementById("app") ?? document.body;

const game = createGame({
  id: "showcase-orbital-defense",
  target,
  layout: "full-bleed",
  scene: () => ({ nodes: [] }),
  qualityRebuild: { flags: [ROUTE_FLAG] }
});

game.start();
void game.ready().then(() => {
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    state: game.session.state,
    frame: 0,
    firstFrameAt: performance.now(),
    sessionStartedAt: performance.now()
  };
});
