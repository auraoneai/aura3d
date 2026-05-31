import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <div id="scene"></div>
  <div class="rate-panel">
    <label class="rate-label" for="emission-rate">
      <span>emission rate</span>
      <output id="rate-value" for="emission-rate">2400 particles/sec</output>
    </label>
    <input id="emission-rate" type="range" min="900" max="3200" step="100" value="2400" />
  </div>
`);

const rateInput = document.querySelector<HTMLInputElement>("#emission-rate");
const rateValue = document.querySelector<HTMLOutputElement>("#rate-value");

let app: ReturnType<typeof createAuraApp> | undefined;

function renderFountain(count: number) {
  app?.dispose();
  app = createAuraApp("#scene", {
    scene: scene()
      .background("#030711")
      .addMany(prefabs.particleFountain({ count, color: "#7dfcff" }))
      .add(lights.studio({ intensity: 1.15 }))
      .add(interactions.orbit())
      .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
  });
}

function setEmissionRate(count: number) {
  if (rateValue) {
    rateValue.value = `${count} particles/sec`;
  }
  renderFountain(count);
}

rateInput?.addEventListener("input", () => {
  setEmissionRate(Number(rateInput.value));
});

setEmissionRate(Number(rateInput?.value ?? 2400));
