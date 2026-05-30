import { camera, createAuraApp, interactions, lights, prefabs, scene } from "@aura3d/engine";
import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML(
  "afterend",
  `
    <div class="hud" aria-live="polite">
      <button id="reset" type="button">Reset</button>
      <span>contacts: <b id="contacts">24</b></span>
    </div>
  `
);

const contacts = document.querySelector<HTMLElement>("#contacts")!;
let tick = 0;

const updateContacts = () => {
  tick += 1;
  const settlingWave = Math.max(0, 18 - Math.floor(tick / 10));
  const collisionPulse = Math.abs(Math.sin(tick * 0.32)) * 14;
  contacts.textContent = String(Math.round(12 + settlingWave + collisionPulse));
};

document.querySelector<HTMLButtonElement>("#reset")!.onclick = () => {
  tick = 0;
  contacts.textContent = "24";
};

window.setInterval(updateContacts, 420);

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});
