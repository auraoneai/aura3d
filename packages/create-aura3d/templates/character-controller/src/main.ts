// Character controller preview: keyboard input -> kinematic speed -> @aura3d/animation locomotion
// kit (idle/walk/run blended by speed) -> live proof object. Hold a direction key (W/A/S/D or
// arrows) to walk; hold Shift to run. A minimal Aura3D stage renders beneath the HUD.
import { camera, createAuraApp, lights, material, model, primitives, scene } from "@aura3d/engine";
import { createPerformanceGovernor, createTopDownGameRenderPreset } from "@aura3d/engine/production-runtime";
import { createLocomotionKit } from "@aura3d/animation";
import { assets } from "./aura-assets.js";
import { defaultCharacterControllerTuning, stepCharacterSpeed, type CharacterControllerState } from "./controller.js";

interface CharacterControllerProof {
  speed: number;
  state: string;
  moving: boolean;
  running: boolean;
  clipWeights: ReadonlyArray<{ clip: string; weight: number }>;
  hero: { readonly assetId: string; readonly url: string; readonly clip: string };
  debugDraw: boolean;
  governor: { readonly resolutionScale: number; readonly particleScale: number; readonly lodBias: number; readonly shadowSize: number };
}

declare global {
  interface Window {
    __AURA3D_CHARACTER_CONTROLLER_PROOF__?: CharacterControllerProof;
  }
}

const tuning = defaultCharacterControllerTuning;
const kit = createLocomotionKit({ idleClip: "Idle", walkClip: "Walk", runClip: "Run", walkSpeed: tuning.walkSpeed, runSpeed: tuning.runSpeed });

const moveKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const held = new Set<string>();
window.addEventListener("keydown", (event) => held.add(event.code));
window.addEventListener("keyup", (event) => held.delete(event.code));

// J3 scaffold surface: the engine perf governor watches frame cost against the
// top-down preset budget, and the debug key gates overlay detail in the HUD.
const governorBudget = createTopDownGameRenderPreset().performanceBudget;
let governor = createPerformanceGovernor("conservative");
let debugDraw = false;

const root = document.getElementById("app") ?? document.body;
const hud = document.createElement("pre");
hud.id = "character-controller-hud";
hud.style.cssText = "font:14px monospace;padding:16px;color:#6cf;background:#0c0f16;min-height:140px";
root.appendChild(hud);

// Certified hero stage: the E1 humanoid-a rig (showcaseWalkAnimatedGirl, "Take
// 001") plays its certified clip on a floor so the route renders a real Aura3D
// scene alongside the locomotion HUD proof.
const stage = document.createElement("div");
stage.id = "character-controller-stage";
stage.style.cssText = "height:320px";
root.appendChild(stage);
createAuraApp(stage, {
  scene: scene()
    .background("#0c0f16")
    .camera(camera.orbit({ target: [0, 0.8, 0], distance: 3.2 }))
    .add(primitives.box({ name: "floor", size: [6, 0.1, 6], position: [0, -0.05, 0], material: material.pbr({ color: "#151b27", roughness: 0.9 }), receiveShadow: true }))
    .add(model(assets.showcaseWalkAnimatedGirl, { name: "certified hero humanoid-a" }).position(0, 0, 0).animate({ clip: "Take 001", loop: true }))
    .add(lights.ambient({ intensity: 0.35 }))
    .add(lights.directional({ name: "key", position: [3, 5, 2], intensity: 1.4 }))
});

let state: CharacterControllerState = { speed: 0 };
let last = 0;

function frame(time: number): void {
  const dt = last === 0 ? 1 / 60 : Math.min(0.05, (time - last) / 1000);
  last = time;
  if (held.has("KeyT")) {
    debugDraw = !debugDraw;
    held.delete("KeyT");
  }
  const move = [...held].some((code) => moveKeys.has(code));
  const run = held.has("ShiftLeft") || held.has("ShiftRight");
  state = stepCharacterSpeed(state, { move, run }, dt, tuning);
  const sample = kit.sample(state.speed, dt);
  governor = governor.step(
    { fps: 1 / Math.max(1 / 240, dt), frameTimeMs: dt * 1000, draws: 0, tris: 0, particles: 0, shadowBytes: 0 },
    governorBudget
  );
  const proof: CharacterControllerProof = {
    speed: Number(state.speed.toFixed(3)),
    state: sample.state,
    moving: sample.moving,
    running: sample.running,
    clipWeights: sample.clipWeights.map((w) => ({ clip: w.clip, weight: Number(w.weight.toFixed(3)) })),
    hero: { assetId: assets.showcaseWalkAnimatedGirl.id, url: assets.showcaseWalkAnimatedGirl.url, clip: "Take 001" },
    debugDraw,
    governor: { ...governor.settings }
  };
  window.__AURA3D_CHARACTER_CONTROLLER_PROOF__ = proof;
  hud.textContent = [
    "Aura3D Character Controller — hold W/A/S/D (Shift = run, T = debug)",
    `speed: ${proof.speed}`,
    `state: ${proof.state}`,
    `clips: ${proof.clipWeights.map((w) => `${w.clip} ${w.weight}`).join("  ")}`,
    ...(debugDraw ? [`governor: res ${proof.governor.resolutionScale} lod ${proof.governor.lodBias} shadow ${proof.governor.shadowSize}`] : [])
  ].join("\n");
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
