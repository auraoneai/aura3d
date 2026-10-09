// Character controller: keyboard input -> kinematic speed -> locomotion state
// -> the E1 humanoid rig driven through its certified clip (playback speed
// tracks locomotion) -> shoulder camera + DOM HUD + live proof object.
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the §7.7 sci-fi-telemetry HUD theme, the §6.11 dpad-2btn touch preset,
// game-sfx-core cues, and the juice event map.
import {
  camera,
  game,
  gameFeel,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
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
  hero: { readonly assetId: string; readonly url: string; readonly clip: string; readonly metres: readonly [number, number, number] };
  position: readonly [number, number, number];
  yawDegrees: number;
  look: { readonly id: string; readonly category: string };
  camera: { readonly rig: string; readonly presented: boolean };
  debugDraw: boolean;
  governor: { readonly resolutionScale: number; readonly particleScale: number; readonly lodBias: number; readonly shadowSize: number };
}

declare global {
  interface Window {
    __AURA3D_CHARACTER_CONTROLLER_PROOF__?: CharacterControllerProof;
  }
}

const LOOK_ID = "outdoor-day" as const;
const tuning = defaultCharacterControllerTuning;
const kit = createLocomotionKit({ idleClip: "Idle", walkClip: "Walk", runClip: "Run", walkSpeed: tuning.walkSpeed, runSpeed: tuning.runSpeed });

// showcaseWalkAnimatedGirl is authored in centimetres (86.9 × 161.8 × 37.8);
// scale 0.01 puts the E1 humanoid rig at its real 1.62 m height.
const HERO_SCALE = 0.01;
// The certified rig ships a single take; locomotion is played by pacing that
// clip to the movement speed (0 = posed idle frame, >1 = run-paced walk).
const CERTIFIED_CLIP = "Take 001";
const CLIP_SPEED: Record<"idle" | "walk" | "run", number> = {
  idle: 0,
  walk: 1,
  run: Number((tuning.runSpeed / tuning.walkSpeed).toFixed(2))
};

const moveKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const held = new Set<string>();
window.addEventListener("keydown", (event) => held.add(event.code));
window.addEventListener("keyup", (event) => held.delete(event.code));

const governorBudget = createTopDownGameRenderPreset().performanceBudget;
let governor = createPerformanceGovernor("conservative");
let debugDraw = false;

// Full-bleed canvas: the app mounts straight into #app, which flexes to fill
// the viewport (see index.html).
const controllerGame = createGame({
  id: "character-controller",
  target: "#app",
  autoStart: true,
  input: {
    actions: {
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      run: ["ShiftLeft", "ShiftRight"],
      debug: ["KeyT"]
    },
    bufferMs: 100
  },
  hud: { theme: "sci-fi-telemetry", widgets: [] },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", dash: "run", jump: "debug", attack: "debug" }
  },
  sound: {
    cues: {
      step: { id: "step", asset: { url: sfxUrl("footsteps.grass.00") }, volume: 0.4 },
      "run-start": { id: "run-start", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.4 },
      "debug-toggle": { id: "debug-toggle", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.5 }
    }
  },
  juice: {
    "run-start": { punch: { fovDeg: 1.4, ms: 260 } },
    "debug-toggle": { flash: { color: "#9fc7ff", peak: 0.12, ms: 120 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { characterController: () => window.__AURA3D_CHARACTER_CONTROLLER_PROOF__ ?? { status: "unbound" } }
  },
  scene: () => scene()
    .add(looks.preset(LOOK_ID))
    .add(primitives.box({ name: "walkable ground", size: [30, 0.1, 30], position: [0, -0.05, 0], material: material.pbr({ color: "#4a6b3a", roughness: 0.92 }), receiveShadow: true }))
    .add(primitives.box({ name: "distance marker north", size: [0.4, 1.4, 0.4], position: [0, 0.7, -6], material: material.pbr({ color: "#d97a3a", roughness: 0.6 }), castShadow: true }))
    .add(primitives.box({ name: "distance marker east", size: [0.4, 1.4, 0.4], position: [5, 0.7, 0], material: material.pbr({ color: "#7fa3c2", roughness: 0.6 }), castShadow: true }))
    .add(primitives.box({ name: "distance marker south-east", size: [0.4, 1.4, 0.4], position: [3.5, 0.7, 4.5], material: material.pbr({ color: "#b987d0", roughness: 0.6 }), castShadow: true }))
    // C-10: a world wall for the shoulder rig's collision damper to pull in on.
    .add(primitives.box({ name: "collision wall", size: [0.4, 2.4, 4], position: [2.4, 1.2, 4.2], material: material.pbr({ color: "#8a94a6", roughness: 0.85 }), castShadow: true }))
    .add(
      model(assets.showcaseWalkAnimatedGirl, { name: "certified hero humanoid-a", castShadow: true })
        .position(0, 0, 0)
        .scale(HERO_SCALE)
        .animate({ clip: CERTIFIED_CLIP, loop: true, speed: 0 })
        .runtime(game.runtimeNode("hero", { tags: ["player"] }))
    )
    .camera(camera.perspective({ position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], fov: 55 }))
});
const app = controllerGame.app;

const heroNode: AuraRuntimeNodeHandle = app.nodes.require("hero");
// F-08-1/C-10: the shoulder rig owns the presented camera and damps through
// world collision (flag-off mounts the no-op stub controller; the authored
// perspective spec stays the fallback). Right-half drag binds an orbit rig's
// pointer handler for look input (no-op while rigs resolve to stubs).
app.camera?.use(camera.rigs.shoulder({ target: "hero", collision: true }));
const orbit = camera.rigs.orbit({ target: "hero" });
const lookPad = document.createElement("div");
lookPad.id = "look-pad";
lookPad.setAttribute("style", "position:fixed;right:0;top:0;width:50%;height:100%;touch-action:none;");
document.body.appendChild(lookPad);
const orbitPointer = (orbit as { bindPointer?: (el: HTMLElement) => void }).bindPointer;
if (orbitPointer) orbitPointer.call(orbit, lookPad);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("platformer");

const hudRoot = createHud();
let state: CharacterControllerState = { speed: 0 };
let position = { x: 0, y: 0, z: 0 };
let yaw = 0;
let locomotionState: "idle" | "walk" | "run" = "idle";

app.onFrame(({ dt }: { readonly dt: number }) => {
  const seconds = Math.min(0.05, dt);
  if (held.has("KeyT")) {
    debugDraw = !debugDraw;
    held.delete("KeyT");
    controllerGame.juice.fire("debug-toggle");
    void controllerGame.sound?.cue("debug-toggle");
  }

  const dx = (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) - (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
  const dz = (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0) - (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0);
  const moving = [...held].some((code) => moveKeys.has(code));
  const running = held.has("ShiftLeft") || held.has("ShiftRight");
  const wasRunning = state.speed >= tuning.runSpeed - 0.01;
  state = stepCharacterSpeed(state, { move: moving, run: running }, seconds, tuning);
  const isRunning = state.speed >= tuning.runSpeed - 0.01;
  if (isRunning && !wasRunning) {
    controllerGame.juice.fire("run-start");
    void controllerGame.sound?.cue("run-start");
  }

  if (dx !== 0 || dz !== 0) {
    const length = Math.hypot(dx, dz);
    const dirX = dx / length;
    const dirZ = dz / length;
    position = { x: position.x + dirX * state.speed * seconds, y: 0, z: position.z + dirZ * state.speed * seconds };
    yaw = Math.atan2(dirX, dirZ);
  }

  const sample = kit.sample(state.speed, seconds);
  const nextLocomotion = sample.state === "run" ? "run" : sample.state === "walk" ? "walk" : "idle";
  heroNode.setPosition(position.x, position.y, position.z).setRotation(0, yaw, 0);
  if (nextLocomotion !== locomotionState) {
    locomotionState = nextLocomotion;
    heroNode.setAnimation({ clip: CERTIFIED_CLIP, loop: true, speed: CLIP_SPEED[locomotionState] });
  }

  // The shoulder rig presents the camera; dt arrives scaled by app.time.
  feel.update(dt * 1000);

  governor = governor.step(
    { fps: 1 / Math.max(1 / 240, seconds), frameTimeMs: seconds * 1000, draws: 0, tris: 0, particles: 0, shadowBytes: 0 },
    governorBudget
  );

  const presented = Boolean(app.camera?.presented());
  const proof: CharacterControllerProof = {
    speed: Number(state.speed.toFixed(3)),
    state: sample.state,
    moving: sample.moving,
    running: sample.running,
    clipWeights: sample.clipWeights.map((w) => ({ clip: w.clip, weight: Number(w.weight.toFixed(3)) })),
    hero: {
      assetId: assets.showcaseWalkAnimatedGirl.id,
      url: assets.showcaseWalkAnimatedGirl.url,
      clip: CERTIFIED_CLIP,
      metres: assets.showcaseWalkAnimatedGirl.bounds
    },
    position: [Number(position.x.toFixed(3)), position.y, Number(position.z.toFixed(3))],
    yawDegrees: Number((yaw * 180 / Math.PI).toFixed(1)),
    look: { id: LOOK_ID, category: "environment" },
    camera: { rig: heroNode ? "shoulder:hero" : "", presented },
    debugDraw,
    governor: { ...governor.settings }
  };
  window.__AURA3D_CHARACTER_CONTROLLER_PROOF__ = proof;
  renderHud(proof);
});

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "character-controller-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:300px",
    "font:600 13px/1.4 Inter, system-ui, sans-serif",
    "color:#f2f8ff",
    "background:rgba(16,26,34,0.72)",
    "border:1px solid rgba(160,200,255,0.3)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(proof: CharacterControllerProof): void {
  hudRoot.innerHTML = [
    `<strong>Aura3D Character Controller</strong> — hold W/A/S/D (Shift = run, T = debug)`,
    `<div>speed: ${proof.speed} | state: ${proof.state} | pos: ${proof.position[0]}, ${proof.position[2]}</div>`,
    `<div>clips: ${proof.clipWeights.map((w) => `${w.clip} ${w.weight}`).join("  ")}</div>`,
    `<div>look: ${proof.look.id} | camera: ${proof.camera.rig} presented=${proof.camera.presented}</div>`,
    ...(proof.debugDraw ? [`<div>governor: res ${proof.governor.resolutionScale} lod ${proof.governor.lodBias} shadow ${proof.governor.shadowSize}</div>`] : [])
  ].join("");
}
