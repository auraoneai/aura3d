import { camera, createAuraApp, effects, lights, prefabs, scene } from "@aura3d/engine";
import "./style.css";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;

appRoot.insertAdjacentHTML(
  "afterend",
  `
    <div class="hud" aria-label="city controls">
      <button class="toggle" type="button" aria-pressed="false">switch to night</button>
    </div>
  `
);

let isNight = false;
let auraApp: { dispose?: () => void } | undefined;

function cityScene(night: boolean) {
  return scene()
    .background(night ? "#061018" : "#87ceeb")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true }))
    .add(effects.fog({ density: night ? 0.07 : 0.04 }))
    .add(lights.studio({ intensity: night ? 0.52 : 1.08 }))
    .camera(camera.perspective({ position: [0, 3.6, 7.2], target: [0, 0.55, -0.8] }));
}

function renderCity() {
  auraApp?.dispose?.();
  auraApp = createAuraApp("#app", {
    scene: cityScene(isNight)
  });
}

document.querySelector<HTMLButtonElement>(".toggle")!.onclick = (event) => {
  isNight = !isNight;
  const button = event.currentTarget;
  button.textContent = isNight ? "switch to day" : "switch to night";
  button.setAttribute("aria-pressed", String(isNight));
  renderCity();
};

renderCity();
