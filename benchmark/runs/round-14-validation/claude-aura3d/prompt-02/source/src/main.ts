import {
  camera,
  createAuraApp,
  lights,
  prefabs,
  scene,
  ui
} from "@aura3d/engine";

// Emission-rate control. The slider value drives the real emissionRate passed
// to prefabs.particleFountain, not just a label.
ui.html(
  "#app",
  `
  <label style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(15,23,42,.78);color:white;font:700 14px system-ui">
    emission rate <input id="rate" type="range" min="60" max="180" value="120" />
    <span id="rate-value">120</span>
  </label>
`
);
ui.slider("#rate", { min: 60, max: 180, value: 120, metric: "particle-emission-rate" });

function buildScene(emissionRate: number) {
  return scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count: 2400, emissionRate }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(
      camera.autoFrame({ bounds: { min: [-2.5, 0, -2.5], max: [2.5, 3.6, 2.5] } })
    );
}

let app = createAuraApp("#app", {
  scene: buildScene(Number(ui.range("#rate").value))
});

// Changing the slider rebuilds the fountain with a new, real emission rate.
ui.onInput("#rate", (input) => {
  ui.setText("#rate-value", input.value);
  app.dispose();
  app = createAuraApp("#app", { scene: buildScene(Number(input.value)) });
});
