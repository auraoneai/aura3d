// Starter: small game. "Gem Grove": walk the archer around a grassy island and collect every gem before time runs out.
// Shape of an Aura3D game: the look owns light, shadow, sky and grade; typed assets for the player and the props;
// a deterministic fixed-step simulation (no Date.now, no Math.random) copied to nodes in render(); the HUD in the DOM;
// R restarts by resetting state and nodes. Controls: WASD or arrow keys to move, R to restart.
// Full games (pause, touch, results screens): `createGame` in docs/agents/build-a-game.md.
import { camera, createAuraApp, createFixedStepLoop, instances, looks, material, model, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";
import { assets } from "./aura-assets";

const LOOK_ID = "outdoor-day" as const;
const ISLAND_RADIUS = 11;
const ROUND_SECONDS = 45;
const SPEED = 4.2; // metres per second

// Seeded layout: gems on two rings, trees and rocks around the rim.
let seed = 7;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const GEMS: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => {
  const a = i * 2.4 + 0.4, r = i % 2 ? 7.2 : 4.2;
  return [Math.cos(a) * r, Math.sin(a) * r];
});
const trees: AuraTransformSpec[] = Array.from({ length: 26 }, (_, i) => {
  const a = (i / 26) * Math.PI * 2 + rand() * 0.2, r = ISLAND_RADIUS - 1 + rand() * 0.8, s = 1 + rand() * 0.6;
  return { position: [Math.cos(a) * r, 0, Math.sin(a) * r], rotation: [0, rand() * 6.28, 0], scale: [s, s, s] };
});
const rocks: AuraTransformSpec[] = Array.from({ length: 9 }, () => {
  const a = rand() * Math.PI * 2, r = 2.5 + rand() * 6, s = 0.5 + rand() * 0.5;
  return { position: [Math.cos(a) * r, 0, Math.sin(a) * r], rotation: [0, rand() * 6.28, 0], scale: [s, s * 0.7, s] };
});

const gemMaterial = material.emissive({ color: "#7df9ff", emissive: "#2fd8ff", emissiveIntensity: 2.2 });
const stage = scene()
  .add(looks.preset(LOOK_ID, { exposureEv: -0.9, fogDensityScale: 0.4, grade: { contrast: 1.1, saturation: 1.15 } }))
  .add(primitives.plane({ name: "sea", size: [400, 1, 400], material: material.pbr({ color: "#2a7aa0", roughness: 0.12, metallic: 0.2 }) }).position(0, -0.35, 0))
  .add(primitives.cylinder({ name: "island", size: [ISLAND_RADIUS * 2, 0.7, ISLAND_RADIUS * 2], params: { radialSegments: 48 }, material: material.pbr({ color: "#3f7a2a", roughness: 0.95 }), receiveShadow: true }).position(0, -0.35, 0))
  .add(primitives.cylinder({ name: "beach", size: [ISLAND_RADIUS * 2 + 1.6, 0.5, ISLAND_RADIUS * 2 + 1.6], params: { radialSegments: 48 }, material: material.pbr({ color: "#d8c08c", roughness: 1 }), receiveShadow: true }).position(0, -0.5, 0))
  .add(instances.model(assets.tree, { name: "trees", transforms: trees, targetHeight: 3, castShadow: true }))
  .add(instances.model(assets.rocks, { name: "rocks", transforms: rocks, targetHeight: 0.9, castShadow: true, receiveShadow: true }))
  .add(model(assets.player, { name: "player", targetHeight: 1.6, castShadow: true }).animate({ clip: "idle", loop: true }).runtime({ id: "player", mutable: true }))
  .camera(camera.perspective({ position: [0, 6.5, 8.5], target: [0, 0.8, 0], fov: 46 }));
GEMS.forEach(([x, z], i) => stage.add(
  primitives.polyhedron({ name: `gem ${i}`, size: 0.5, params: { variant: "octahedron" }, material: gemMaterial, castShadow: true }).position(x, 0.8, z).runtime({ id: `gem-${i}`, mutable: true })
));

const app = createAuraApp("#app", { scene: stage, ...looks.appOptions(LOOK_ID) });
const input = app.input({ actions: { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], restart: ["KeyR"] } });

// HUD lives in the DOM, never in the 3D scene.
const hud = document.createElement("div");
hud.style.cssText = "position:fixed;left:16px;top:14px;padding:10px 14px;border-radius:10px;background:rgba(10,18,28,.62);color:#f4f1e8;font:600 15px/1.4 ui-monospace,Menlo,monospace;pointer-events:none";
document.body.append(hud);

const state = { x: 0, z: 0, heading: 0, moving: false, collected: new Set<number>(), time: ROUND_SECONDS, over: false, clock: 0 };
const reset = (): void => {
  Object.assign(state, { x: 0, z: 0, heading: 0, moving: false, time: ROUND_SECONDS, over: false });
  state.collected.clear();
  GEMS.forEach((_, i) => app.nodes.require(`gem-${i}`).setVisible(true));
};

let wasMoving = false;
createFixedStepLoop({
  stepSeconds: 1 / 60,
  step: (dt) => {
    input.update(dt);
    state.clock += dt;
    if (input.pressed("restart")) reset();
    if (state.over) return;
    const dx = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
    const dz = (input.held("down") ? 1 : 0) - (input.held("up") ? 1 : 0);
    const len = Math.hypot(dx, dz);
    state.moving = len > 0;
    if (state.moving) {
      state.x += (dx / len) * SPEED * dt;
      state.z += (dz / len) * SPEED * dt;
      const r = Math.hypot(state.x, state.z), max = ISLAND_RADIUS - 1.6; // stay on the island
      if (r > max) { state.x *= max / r; state.z *= max / r; }
      state.heading = Math.atan2(dx, dz);
    }
    GEMS.forEach(([gx, gz], i) => {
      if (!state.collected.has(i) && Math.hypot(gx - state.x, gz - state.z) < 0.8) state.collected.add(i);
    });
    state.time = Math.max(0, state.time - dt);
    if (state.collected.size === GEMS.length || state.time === 0) state.over = true;
  },
  render: () => {
    const player = app.nodes.require("player").setPosition(state.x, 0, state.z).setRotation(0, state.heading, 0);
    if (state.moving !== wasMoving) { player.play(state.moving ? "walk" : "idle", { loop: true, crossFade: 0.2 }); wasMoving = state.moving; }
    GEMS.forEach((_, i) => {
      const gem = app.nodes.require(`gem-${i}`);
      if (state.collected.has(i)) gem.setVisible(false);
      else gem.setRotation(0, state.clock * 1.8 + i, 0).setPosition(GEMS[i]![0], 0.8 + 0.15 * Math.sin(state.clock * 2.4 + i), GEMS[i]![1]);
    });
    app.camera?.setPose({ position: [state.x * 0.7, 6.5, state.z * 0.7 + 8.5], target: [state.x * 0.9, 0.8, state.z * 0.9], fov: 46 });
    const won = state.collected.size === GEMS.length;
    hud.textContent = `Gems ${state.collected.size}/${GEMS.length}   Time ${state.time.toFixed(0)}s${state.over ? (won ? "   You win! R to play again" : "   Time up. R to retry") : "   WASD to move"}`;
  }
}).start();

(window as unknown as { __AURA3D_STARTER__?: unknown }).__AURA3D_STARTER__ = {
  starter: "game",
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { assetId: assets.player.id, url: assets.player.url, license: "Kenney Mini Forest, CC0-1.0" },
  state: () => ({ x: state.x, z: state.z, gems: state.collected.size, time: state.time, over: state.over })
};

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
