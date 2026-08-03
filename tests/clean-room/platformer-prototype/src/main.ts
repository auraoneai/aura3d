/**
 * Clean-room platformer prototype.
 *
 * Public surface only. Measures what a developer must author for a jump that suits its
 * own level, collectibles, checkpoints, a following camera and a restart.
 */
import {
  camera,
  createAuraApp,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  solvePlatformerMotion,
  validatePlatformerMotion
} from "@aura3d/engine";
import { assets } from "./assets";

/** Authored level. The only level data in the project. */
const PLATFORMS = [
  { id: "ground", x: -1, y: 0, width: 4, height: 0.3 },
  { id: "p1", x: 4, y: 0.6, width: 2, height: 0.3 },
  { id: "p2", x: 7, y: 1.2, width: 2, height: 0.3 },
  { id: "p3", x: 10.2, y: 0.9, width: 2, height: 0.3 },
  { id: "p4", x: 13.4, y: 1.7, width: 2, height: 0.3 },
  { id: "p5", x: 16.8, y: 1.2, width: 3, height: 0.3 }
];

/** Motion derived from the level, not hand-tuned. Reported so it is checkable. */
const motion = solvePlatformerMotion(PLATFORMS, { riseSeconds: 0.28, targetSessionSeconds: 90 });
const motionReport = validatePlatformerMotion(PLATFORMS, motion);

const level = {
  id: "clean-room-level",
  gravity: motion.gravity,
  jumpVelocity: motion.jumpVelocity,
  moveSpeed: motion.moveSpeed,
  coyoteMs: motion.coyoteMs,
  jumpBufferMs: motion.jumpBufferMs,
  playerSize: [0.4, 0.8] as const,
  start: { x: 0, y: 0.5 },
  finish: { x: 18, y: 1.7 },
  lowerBound: -3,
  platforms: PLATFORMS,
  collectibles: [
    { id: "c1", x: 4.8, y: 1.1 }, { id: "c2", x: 7.8, y: 1.7 },
    { id: "c3", x: 11, y: 1.4 }, { id: "c4", x: 14.2, y: 2.2 }
  ],
  checkpoints: [{ id: "cp1", x: 7.8, y: 1.5 }, { id: "cp2", x: 14.2, y: 2 }],
  hazards: [{ id: "h1", x: 9.4, y: 0.2, width: 0.7, height: 0.2 }]
};

const platformer = game.platformer(level);
const input = game.input({
  actions: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], jump: ["Space", "KeyW", "ArrowUp"], reset: ["KeyR"] },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: motion.jumpBufferMs
});

const app = createAuraApp("#stage", {
  diagnostics: { overlay: false },
  scene: scene()
    .background("#8ec7e6")
    .addMany(PLATFORMS.map((platform) => primitives.box({
      name: `platform ${platform.id}`, material: material.pbr({ color: "#5d8b4a", roughness: 0.82 })
    }).position(platform.x + platform.width / 2, platform.y + platform.height / 2, 0).scale([platform.width, platform.height, 1])))
    .addMany(level.collectibles.map((coin) => primitives.sphere({
      name: `coin ${coin.id}`, material: material.emissive({ color: "#ffd166", emissive: "#ffd166", emissiveIntensity: 1 })
    }).position(coin.x, coin.y, 0).scale(0.12).runtime(game.runtimeNode(`coin-${coin.id}`, { tags: ["collectible"] }))))
    .addMany(level.hazards.map((hazard) => primitives.box({
      name: `hazard ${hazard.id}`, material: material.emissive({ color: "#e2483a", emissive: "#e2483a", emissiveIntensity: 0.6 })
    }).position(hazard.x + hazard.width / 2, hazard.y, 0).scale([hazard.width, hazard.height, 1])))
    .add(model(assets.showcaseKenneyOobiPlatformerHero, {
      name: "hero", scaleMode: "fit", targetHeight: 0.8, castShadow: true
    }).position(0, 0.5, 0).runtime(game.runtimeNode("hero", { tags: ["player"] })))
    .add(lights.ambient({ intensity: 0.72, color: "#e9f6ff" }))
    .add(lights.directional({ position: [-6, 10, 8], intensity: 1.7, color: "#fff5e2" }))
    .camera(camera.perspective({ position: [0, 2.2, 7], target: [0, 1, 0], fov: 44 }))
});

const hero = app.nodes.require("hero");
const coinNodes = new Map(level.collectibles.map((coin) => [coin.id, app.nodes.require(`coin-${coin.id}`)]));
const hud = document.querySelector("#hud");

app.onFrame(({ dt }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  const snapshot = input.update(step);
  const state = platformer.step(step, {
    moveX: input.axis("moveX"),
    jumpPressed: snapshot.actions.jump?.pressed === true || snapshot.actions.jump?.buffered === true,
    jumpHeld: input.held("jump"),
    reset: snapshot.actions.reset?.pressed === true
  });
  hero.setPosition(state.player.x, state.player.y + 0.4, 0);
  hero.setRotation(0, state.player.facing >= 0 ? Math.PI / 2 : -Math.PI / 2, 0);
  for (const [id, node] of coinNodes) node.setVisible(!state.collected.includes(id));
  if (hud) hud.textContent = `${state.status} · ${state.collected.length}/${level.collectibles.length} coins · ${state.checkpointId} · deaths ${state.deaths}`;
  (window as unknown as Record<string, unknown>).__CLEAN_ROOM_PLATFORMER__ = {
    appId: "clean-room-platformer", status: state.status,
    grounded: state.player.grounded, x: state.player.x, y: state.player.y,
    collected: state.collected.length, deaths: state.deaths, checkpointId: state.checkpointId,
    motion: { apex: motion.apex, airtime: motion.airtime, jumpReach: motion.jumpReach, estimatedSessionSeconds: motion.estimatedSessionSeconds },
    motionInvariants: motionReport
  };
});
