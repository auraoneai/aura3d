import { camera, createAuraApp, interactions, lights, prefabs, scene } from "@aura3d/engine";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app")!;

root.insertAdjacentHTML(
  "afterend",
  `
    <div class="hud" aria-label="Particle fountain controls">
      <label for="emission-rate">emission rate</label>
      <input id="emission-rate" type="range" min="900" max="3600" step="300" value="2400" />
      <output id="emission-rate-value" for="emission-rate">2400 particles</output>
    </div>
  `
);

const rateInput = document.querySelector<HTMLInputElement>("#emission-rate")!;
const rateOutput = document.querySelector<HTMLOutputElement>("#emission-rate-value")!;

const makeScene = (count: number) =>
  scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }));

let app = createAuraApp(root, {
  scene: makeScene(Number(rateInput.value))
});

rateInput.addEventListener("input", () => {
  rateOutput.value = `${rateInput.value} particles`;
});

rateInput.addEventListener("change", () => {
  app.dispose();
  app = createAuraApp(root, {
    scene: makeScene(Number(rateInput.value))
  });
});
