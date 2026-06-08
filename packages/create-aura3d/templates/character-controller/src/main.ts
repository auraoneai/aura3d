// Character controller preview: keyboard input -> kinematic speed -> @aura3d/animation locomotion
// kit (idle/walk/run blended by speed) -> live proof object. Hold a direction key (W/A/S/D or
// arrows) to walk; hold Shift to run.
import { createLocomotionKit } from "@aura3d/animation";
import { defaultCharacterControllerTuning, stepCharacterSpeed, type CharacterControllerState } from "./controller.js";

interface CharacterControllerProof {
  speed: number;
  state: string;
  moving: boolean;
  running: boolean;
  clipWeights: ReadonlyArray<{ clip: string; weight: number }>;
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

const root = document.getElementById("app") ?? document.body;
const hud = document.createElement("pre");
hud.id = "character-controller-hud";
hud.style.cssText = "font:14px monospace;padding:16px;color:#6cf;background:#0c0f16;min-height:140px";
root.appendChild(hud);

let state: CharacterControllerState = { speed: 0 };
let last = 0;

function frame(time: number): void {
  const dt = last === 0 ? 1 / 60 : Math.min(0.05, (time - last) / 1000);
  last = time;
  const move = [...held].some((code) => moveKeys.has(code));
  const run = held.has("ShiftLeft") || held.has("ShiftRight");
  state = stepCharacterSpeed(state, { move, run }, dt, tuning);
  const sample = kit.sample(state.speed, dt);
  const proof: CharacterControllerProof = {
    speed: Number(state.speed.toFixed(3)),
    state: sample.state,
    moving: sample.moving,
    running: sample.running,
    clipWeights: sample.clipWeights.map((w) => ({ clip: w.clip, weight: Number(w.weight.toFixed(3)) }))
  };
  window.__AURA3D_CHARACTER_CONTROLLER_PROOF__ = proof;
  hud.textContent = [
    "Aura3D Character Controller — hold W/A/S/D (Shift = run)",
    `speed: ${proof.speed}`,
    `state: ${proof.state}`,
    `clips: ${proof.clipWeights.map((w) => `${w.clip} ${w.weight}`).join("  ")}`
  ].join("\n");
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
