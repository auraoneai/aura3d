import { camera, createAuraApp, interactions, lights, prefabs, scene } from "@aura3d/engine";
import "./style.css";

// Prompt-required score counter HUD overlay (small DOM overlay only).
document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML(
  "afterend",
  `<div class="hud">
     <span>Strokes: <b id="strokes">0</b></span>
     <span class="hint">click the green to aim &amp; shoot</span>
   </div>`
);

// Click-to-aim-and-shoot: each pointer shot on the green advances the score.
const strokes = document.querySelector<HTMLElement>("#strokes")!;
let shots = 0;
document.querySelector<HTMLDivElement>("#app")!.addEventListener("pointerdown", () => {
  shots += 1;
  strokes.textContent = String(shots);
});

createAuraApp("#app", {
  scene: scene()
    .background("#7dd3fc")
    .addMany(prefabs.miniGolfHole())
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.pointer())
    .camera(camera.perspective({ position: [0, 2.6, 4.2], target: [0, 0, -0.45] }))
});
