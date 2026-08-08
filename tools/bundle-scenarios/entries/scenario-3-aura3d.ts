/**
 * Scenario 3 — game runtime, Aura3D.
 *
 * Input, animation, physics integration, game loop. This is where an integrated engine should win on
 * authored lines even if it loses on bytes, because the Three.js equivalent needs a separate physics
 * library the developer has to install and wire.
 */
import { createAuraApp, camera, game, lights, material, primitives, scene } from "@aura3d/engine/lean-game";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const app = createAuraApp(canvas, {
  physics: { gravity: [0, -9.81, 0] },
  scene: scene()
    .background("#07101a")
    .camera(camera.perspective({ position: [0, 6, 10], target: [0, 1, 0] }))
    .add(lights.directional({ intensity: 2.2 }).position(4, 8, 6))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#1d2530" }) }).scale([20, 1, 20]).physics({ type: "static" }))
    .add(primitives.box({ name: "player", material: material.pbr({ color: "#4fd1c5" }) }).position(0, 2, 0).physics({ type: "dynamic", mass: 1 }))
});
const input = app.input({ actions: { jump: ["Space"], left: ["ArrowLeft"], right: ["ArrowRight"] } });
const player = app.physics.bodies.require("player");
app.onFrame(() => {
  if (input.pressed("jump")) player.applyImpulse([0, 5, 0]);
  if (input.held("left")) player.applyForce([-8, 0, 0]);
  if (input.held("right")) player.applyForce([8, 0, 0]);
});
(globalThis as { __app?: unknown }).__app = { app, game };
