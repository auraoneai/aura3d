import { camera, createAuraApp, interactions, lights, prefabs, scene } from "@aura3d/engine";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.insertAdjacentHTML(
  "afterend",
  `
    <div class="hud" aria-live="polite">
      <div class="score">
        <span>strokes</span>
        <strong id="strokes">0</strong>
      </div>
      <div class="shot">
        <span id="shot-label">click the green to aim</span>
        <div class="power"><span id="power-bar"></span></div>
      </div>
      <div class="camera-chip">follow cam</div>
    </div>
    <div class="aim-ring" id="aim-ring"></div>
  `
);

let strokes = 0;
const strokesLabel = document.querySelector<HTMLStrongElement>("#strokes")!;
const shotLabel = document.querySelector<HTMLSpanElement>("#shot-label")!;
const powerBar = document.querySelector<HTMLSpanElement>("#power-bar")!;
const aimRing = document.querySelector<HTMLDivElement>("#aim-ring")!;

app.addEventListener("pointermove", (event) => {
  aimRing.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  aimRing.classList.add("visible");
});

app.addEventListener("pointerdown", (event) => {
  strokes += 1;
  const power = Math.min(100, Math.max(22, Math.round((event.clientY / window.innerHeight) * 100)));

  strokesLabel.textContent = String(strokes);
  shotLabel.textContent = `shot ${strokes}: ${power}% power`;
  powerBar.style.width = `${power}%`;
  aimRing.classList.add("shooting");
  window.setTimeout(() => aimRing.classList.remove("shooting"), 240);
});

createAuraApp("#app", {
  scene: scene()
    .background("#7dd3fc")
    .addMany(prefabs.miniGolfHole())
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.pointer())
    .camera(camera.perspective({ position: [0, 2.35, 3.85], target: [0, 0.08, -0.45] }))
});
