/**
 * Scenario 3 — game runtime, Aura3D.
 *
 * Input, deterministic arcade motion, and game loop. Physical simulation is a
 * separate opt-in comparison because lean-game must not silently install a solver.
 */
import { createAuraApp, camera, game, lights, material, primitives, scene } from "@aura3d/engine/lean-game";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const app = createAuraApp(canvas, {
  scene: scene()
    .background("#07101a")
    .camera(camera.perspective({ position: [0, 6, 10], target: [0, 1, 0] }))
    .add(lights.directional({ intensity: 2.2 }).position(4, 8, 6))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#1d2530" }) }).scale([20, 1, 20]))
    .add(primitives.box({ name: "player", material: material.pbr({ color: "#4fd1c5" }) }).position(0, 0.35, 0).runtime("player"))
});
const input = app.input({ actions: { jump: ["Space"], left: ["ArrowLeft"], right: ["ArrowRight"] } });
const platformer = game.platformer({ platforms: [{ id: "ground", x: -10, y: 0, width: 20, height: 0.35 }] });
const player = app.nodes.require("player");
app.onFrame((deltaSeconds) => {
  const state = platformer.step(deltaSeconds, {
    moveX: Number(input.held("right")) - Number(input.held("left")),
    jumpPressed: input.pressed("jump")
  });
  player.setPosition(state.player.x, state.player.y + 0.5, 0);
});
(globalThis as { __app?: unknown }).__app = { app, game };
