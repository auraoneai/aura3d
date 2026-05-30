import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app mount point.");
}

root.innerHTML = `
  <main class="fountain-app">
    <div id="aura-stage" class="stage" aria-label="3D particle fountain"></div>
    <section class="control-panel" aria-label="Particle fountain controls">
      <div>
        <p class="eyebrow">Particle Fountain</p>
        <h1>Gravity arc emitter</h1>
      </div>
      <label class="rate-control">
        <span>Emission rate</span>
        <input id="emission-rate" type="range" min="240" max="2200" step="80" value="1320" />
      </label>
      <output id="rate-output" for="emission-rate">1320 particles/sec</output>
      <div class="lifetime-key" aria-label="Lifetime color key">
        <span class="key key-hot"></span>
        <span>young</span>
        <span class="key key-mid"></span>
        <span>mid-life</span>
        <span class="key key-cool"></span>
        <span>falling/fading</span>
      </div>
    </section>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #06090d;
    color: #f4f8fb;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .fountain-app,
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .stage canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .control-panel {
    position: absolute;
    left: 24px;
    bottom: 24px;
    z-index: 5;
    width: min(360px, calc(100vw - 48px));
    box-sizing: border-box;
    padding: 16px;
    border: 1px solid rgba(180, 218, 255, 0.24);
    border-radius: 8px;
    background: rgba(7, 12, 17, 0.82);
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(10px);
  }

  .eyebrow {
    margin: 0 0 4px;
    color: #81f2ff;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1 {
    margin: 0 0 14px;
    font-size: 22px;
    line-height: 1.15;
    font-weight: 760;
  }

  .rate-control {
    display: grid;
    gap: 8px;
    font-size: 13px;
    color: #dbe9f4;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #ffd166;
  }

  output {
    display: block;
    margin-top: 8px;
    color: #ffffff;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .lifetime-key {
    display: grid;
    grid-template-columns: 14px auto 14px auto 14px auto;
    align-items: center;
    gap: 7px;
    margin-top: 14px;
    color: #b8c8d6;
    font-size: 12px;
  }

  .key {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    box-shadow: 0 0 16px currentColor;
  }

  .key-hot {
    color: #ffd166;
    background: #ffd166;
  }

  .key-mid {
    color: #76f4ff;
    background: #76f4ff;
  }

  .key-cool {
    color: #6b8dff;
    background: #6b8dff;
  }

  @media (max-width: 620px) {
    .control-panel {
      left: 12px;
      right: 12px;
      bottom: 12px;
      width: auto;
      padding: 14px;
    }

    h1 {
      font-size: 19px;
    }

    .lifetime-key {
      grid-template-columns: 14px auto 14px auto;
    }
  }
`;
document.head.append(style);

const stage = document.querySelector<HTMLElement>("#aura-stage");
const rateInput = document.querySelector<HTMLInputElement>("#emission-rate");
const rateOutput = document.querySelector<HTMLOutputElement>("#rate-output");

if (!stage || !rateInput || !rateOutput) {
  throw new Error("Particle fountain UI did not initialize.");
}

const buildFountainScene = (emissionRate: number) =>
  scene()
    .background("#06090d")
    .addMany(prefabs.particleFountain({ color: "#77f5ff", count: emissionRate }))
    .add(
      primitives.plane({
        name: "wide visible collision ground plane",
        material: material.pbr({ color: "#172126", roughness: 0.82, metallic: 0.02 })
      })
        .position(0, -0.012, 0)
        .scale([5.4, 1, 5.4])
    )
    .add(
      primitives.cylinder({
        name: "identifiable upward emitter nozzle",
        material: material.metal({ color: "#d7e5ee", roughness: 0.18, metallic: 0.75 })
      })
        .position(0, 0.12, 0)
        .scale([0.18, 0.25, 0.18])
    )
    .add(
      primitives.cylinder({
        name: "emitter direction ring",
        material: material.emissive({ color: "#ffd166", emissive: "#ffd166" })
      })
        .position(0, 0.265, 0)
        .scale([0.28, 0.025, 0.28])
    )
    .add(
      effects.particles({
        name: "warm young lifetime particles at launch",
        emitter: "fountain",
        color: "#ffd166",
        particleCount: Math.round(emissionRate * 0.28),
        radius: 0.62,
        height: 1.22,
        intensity: 1.1,
        speed: 1.24
      })
    )
    .add(
      effects.particles({
        name: "cool fading lifetime particles on descent",
        emitter: "fountain",
        color: "#6b8dff",
        particleCount: Math.round(emissionRate * 0.22),
        radius: 1.55,
        height: 2.15,
        intensity: 0.72,
        speed: 0.74
      })
    )
    .add(lights.ambient({ intensity: 0.42, color: "#a9d8ff" }))
    .add(lights.directional({ position: [3.5, 4.8, 3.2], intensity: 1.32, color: "#ffffff" }))
    .add(interactions.orbit())
    .add(effects.bloom({ intensity: 0.48, color: "#77f5ff" }))
    .camera(camera.orbit({ distance: 4.45, target: [0, 1.15, 0], fov: 45 }))
    .timeline(timeline.loop({ seconds: 6 }));

let app = createAuraApp(stage, {
  scene: buildFountainScene(Number(rateInput.value)),
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  resize: true
});

const setEmissionRate = (value: number) => {
  rateOutput.value = `${value} particles/sec`;
  app.dispose();
  app = createAuraApp(stage, {
    scene: buildFountainScene(value),
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    resize: true
  });
};

rateInput.addEventListener("input", () => {
  setEmissionRate(Number(rateInput.value));
});
