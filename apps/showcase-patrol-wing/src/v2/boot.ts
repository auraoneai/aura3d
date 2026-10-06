// apps/showcase-patrol-wing/src/v2/boot.ts — T1.10 v2 entry stub (T2.x fills the scene).
// Boots through createGame (C-24) with the route flag and publishes the C-24 beacon
// window.__AURA3D_GAME__ once the session reaches "playing".
import { createGame } from "@aura3d/game";

const ROUTE_FLAG = "A3D_QR_ROUTE_PATROL_WING" as const;

const target = document.getElementById("app") ?? document.body;

const game = createGame({
  id: "showcase-patrol-wing",
  target,
  layout: "full-bleed",
  scene: () => ({ nodes: [] }),
  qualityRebuild: { flags: [ROUTE_FLAG] }
});

let frame = 0;
game.app.onRender?.(() => { frame += 1; });
game.start();
void game.ready().then(() => {
  // C-24 beacon: live getters so audits/T2.6 read the mounted app + scene
  // (snapshotForAudit expects beacon.app.scene / beacon.app.diagnostics()).
  (window as unknown as Record<string, unknown>).__AURA3D_GAME__ = {
    route: game.id,
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get frame() { return frame; },
    firstFrameAt: performance.now(),
    sessionStartedAt: performance.now()
  };
});
