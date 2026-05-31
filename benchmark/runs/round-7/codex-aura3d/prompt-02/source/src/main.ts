import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  timeline,
  ui
} from "@aura3d/engine";
import "./style.css";

const rateToCount = (rate: number) => Math.round(900 + rate * 42);

ui.html("#app", `
  <div class="hud">
    <div class="readout">
      <span class="label">emission rate</span>
      <strong id="rateValue">40</strong>
    </div>
    <input id="rateControl" type="range" min="10" max="70" value="40" aria-label="emission rate" />
    <div class="legend" aria-label="lifetime color legend">
      <span class="hot">birth</span>
      <span class="mid">falling</span>
      <span class="cool">fade</span>
    </div>
  </div>
`);

let currentApp: ReturnType<typeof createAuraApp> | undefined;

function mountFountain(rate: number) {
  currentApp?.dispose();

  currentApp = createAuraApp("#app", {
    scene: scene()
      .background("#030711")
      .add(
        primitives.plane({
          name: "visible collision ground plane",
          size: [6.4, 6.4, 1],
          material: material.pbr({ color: "#172033", roughness: 0.82 })
        })
          .rotate(-Math.PI / 2, 0, 0)
          .position(0, -0.02, 0)
      )
      .add(
        primitives.cylinder({
          name: "fountain emitter nozzle",
          size: [0.22, 0.22, 0.16],
          material: material.emissive({ color: "#111827", emissive: "#38bdf8", roughness: 0.34 })
        }).position(0, 0.08, 0)
      )
      .add(
        primitives.sphere({
          name: "bright emission point",
          size: 0.12,
          material: material.emissive({ color: "#f8fafc", emissive: "#f97316" })
        }).position(0, 0.22, 0)
      )
      .addMany(prefabs.particleFountain({ count: rateToCount(rate), color: "#38bdf8" }))
      .add(lights.studio({ intensity: 1.15 }))
      .add(lights.point({ position: [0, 1.2, 0.4], intensity: 1.8, color: "#f97316" }))
      .add(interactions.orbit())
      .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
      .timeline(timeline.loop({ seconds: 4 }))
  });
}

const rateValue = ui.text("#rateValue");
const rateControl = document.querySelector<HTMLInputElement>("#rateControl");

if (rateControl) {
  rateControl.addEventListener("input", () => {
    ui.setText(rateValue, rateControl.value);
  });

  rateControl.addEventListener("change", () => {
    mountFountain(Number(rateControl.value));
  });
}

mountFountain(40);
