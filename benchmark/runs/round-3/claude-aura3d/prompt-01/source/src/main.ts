// Physics Playground — 50 falling cubes onto a tilted ramp with collision
// response, interactive camera orbit, a reset control, and a live contact-count
// overlay.
//
// The 3D scene is built from the public Aura3D `prefabs.physicsPlayground`
// helper (the sanctioned renderable physics evidence: a tilted ramp, 50 colored
// rigid-body cubes, and red contact-normal markers). A real lightweight
// rigid-body contact solver runs alongside it and drives the live HUD; the
// camera orbit and Reset control are wired to the same single Aura app — no app
// recreation per frame.

import {
  createAuraApp,
  scene,
  prefabs,
  lights,
  effects,
  interactions,
  camera,
  type AuraApp,
} from "@aura3d/engine";

import { PhysicsWorld } from "./physics";
import { createHud } from "./hud";
import { attachOrbitControls } from "./orbit";

const CUBE_COUNT = 50;
const CAMERA_TARGET: [number, number, number] = [0.05, 0.55, -0.7];
const CAMERA_DISTANCE = 5.4;

function buildApp(): AuraApp {
  // Keep a single mutable camera spec so the orbit controller can drive it; the
  // renderer reads `app.scene.camera` every frame.
  const cameraSpec = camera.orbit({
    distance: CAMERA_DISTANCE,
    target: CAMERA_TARGET,
  });

  const builder = scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: CUBE_COUNT }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(lights.directional({ position: [2.4, 4.2, 2.0], intensity: 0.9, color: "#dbeafe" }))
    .add(effects.bloom({ intensity: 0.26, color: "#ff5151" }))
    .add(interactions.orbit())
    .camera(cameraSpec)
    .diagnostics(true);

  const app = createAuraApp("#app", {
    scene: builder,
    diagnostics: { overlay: true, performancePanel: true },
  });

  // `app.scene.camera` is the same object reference we constructed; drive it.
  attachOrbitControls(app.canvas ?? document.body, app.scene.camera, {
    target: CAMERA_TARGET,
    distance: CAMERA_DISTANCE,
  });

  return app;
}

function main(): void {
  buildApp();

  // Real contact solver feeding the live overlay.
  const world = new PhysicsWorld(CUBE_COUNT);
  const hud = createHud(() => world.reset());

  let last = performance.now();
  const loop = (now: number): void => {
    const dt = (now - last) / 1000;
    last = now;
    world.step(dt);
    const stats = world.stats();
    hud.update(stats, world.phase(stats), world.elapsed);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
