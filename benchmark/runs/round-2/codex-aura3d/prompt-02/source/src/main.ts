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

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

appRoot.innerHTML = `
  <main class="particle-fountain-app">
    <section id="stage" aria-label="3D particle fountain scene"></section>
    <div class="rate-control" aria-label="Particle emission controls">
      <div>
        <span class="control-label">Emission rate</span>
        <strong id="rate-value">1200 particles/sec</strong>
      </div>
      <input
        id="rate-slider"
        type="range"
        min="350"
        max="2200"
        step="50"
        value="1200"
        aria-label="Emission rate"
      />
      <div class="rate-scale">
        <span>low</span>
        <span>high</span>
      </div>
    </div>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  body {
    overflow: hidden;
    background: #05070d;
    color: #f6fbff;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
      sans-serif;
  }

  .particle-fountain-app {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    background: #05070d;
  }

  #stage {
    position: absolute;
    inset: 0;
  }

  #stage canvas {
    width: 100%;
    height: 100%;
  }

  .rate-control {
    position: absolute;
    left: 18px;
    bottom: 18px;
    z-index: 2;
    width: min(360px, calc(100vw - 36px));
    box-sizing: border-box;
    padding: 14px 16px 12px;
    border: 1px solid rgba(159, 214, 255, 0.32);
    border-radius: 8px;
    background: rgba(7, 12, 18, 0.78);
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.36);
    backdrop-filter: blur(12px);
  }

  .rate-control > div:first-child,
  .rate-scale {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .control-label {
    color: #a6c6d8;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  #rate-value {
    color: #ffcf63;
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
  }

  #rate-slider {
    width: 100%;
    margin: 12px 0 8px;
    accent-color: #5de7ff;
  }

  .rate-scale {
    color: #7f9bab;
    font-size: 12px;
  }

  @media (max-width: 520px) {
    .rate-control {
      left: 12px;
      right: 12px;
      bottom: 12px;
      width: auto;
    }
  }
`;
document.head.append(style);

const stage = document.querySelector<HTMLElement>("#stage");
const slider = document.querySelector<HTMLInputElement>("#rate-slider");
const rateValue = document.querySelector<HTMLElement>("#rate-value");

if (!stage || !slider || !rateValue) {
  throw new Error("Missing particle fountain controls");
}

const fountainStage = stage;
const emissionSlider = slider;
const emissionValue = rateValue;

let auraApp: ReturnType<typeof createAuraApp> | undefined;

function lifetimeColor(lifetime: number): string {
  if (lifetime < 0.28) return "#fff7b2";
  if (lifetime < 0.58) return "#5de7ff";
  if (lifetime < 0.82) return "#8b7dff";
  return "#ff7f5c";
}

function particleArcGuides() {
  const nodes = [];
  const streams = [
    { angle: -0.92, radius: 1.2 },
    { angle: -0.28, radius: 0.92 },
    { angle: 0.48, radius: 1.1 },
    { angle: 1.24, radius: 0.82 }
  ];

  for (const stream of streams) {
    for (let step = 1; step <= 10; step += 1) {
      const lifetime = step / 11;
      const spread = stream.radius * lifetime;
      const x = Math.cos(stream.angle) * spread;
      const z = Math.sin(stream.angle) * spread;
      const y = 0.16 + Math.sin(lifetime * Math.PI) * 2.55;
      const scale = 0.036 + (1 - lifetime) * 0.028;

      nodes.push(
        primitives
          .sphere({
            name: `lifetime colored particle ${Math.round(lifetime * 100)}`,
            material: material.emissive({
              color: lifetimeColor(lifetime),
              emissive: lifetimeColor(lifetime),
              roughness: 0.2
            })
          })
          .position(x, y, z)
          .scale(scale)
          .toJSON()
      );
    }
  }

  return nodes;
}

function splashMarkers() {
  const nodes = [];
  const colors = ["#ffcf63", "#5de7ff", "#ff7f5c", "#8b7dff"];

  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    const radius = 0.72 + (index % 4) * 0.16;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const color = colors[index % colors.length];

    nodes.push(
      primitives
        .sphere({
          name: `ground collision splash ${index + 1}`,
          material: material.emissive({ color, emissive: color, roughness: 0.28 })
        })
        .position(x, 0.035, z)
        .scale([0.085, 0.018, 0.085])
        .toJSON()
    );
  }

  return nodes;
}

function buildFountainScene(rate: number) {
  return scene()
    .background("#05070d")
    .add(
      primitives
        .plane({
          name: "visible collision ground plane",
          material: material.pbr({ color: "#152027", roughness: 0.58, metallic: 0.05 })
        })
        .position(0, -0.02, 0)
        .scale([5.6, 1, 4.6])
    )
    .add(
      primitives
        .cylinder({
          name: "ground collision ripple ring",
          material: material.emissive({ color: "#274d59", emissive: "#357085" })
        })
        .position(0, 0.018, 0)
        .scale([1.24, 0.015, 1.24])
    )
    .addMany(prefabs.particleFountain({ color: "#5de7ff", count: rate }))
    .addMany(particleArcGuides())
    .addMany(splashMarkers())
    .add(lights.ambient({ intensity: 0.2, color: "#a9d9ff" }))
    .add(lights.point({ name: "cool fountain key", position: [-1.9, 2.7, 2.1], color: "#8eefff", intensity: 2.5 }))
    .add(lights.point({ name: "warm lifetime rim", position: [2.2, 1.5, 1.4], color: "#ffcf63", intensity: 1.4 }))
    .add(effects.particles({ name: "rate controlled fountain stream", emitter: "fountain", particleCount: rate, color: "#5de7ff", radius: 1.2, height: 2.75, intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0, 1.35, 4.4], target: [0, 1.1, 0], fov: 42 }))
    .timeline(timeline.loop({ seconds: 6 }));
}

function render(rate: number) {
  auraApp?.dispose();
  fountainStage.innerHTML = "";
  emissionValue.textContent = `${rate.toLocaleString()} particles/sec`;
  auraApp = createAuraApp("#stage", {
    diagnostics: { overlay: false, performancePanel: false },
    scene: buildFountainScene(rate)
  });
}

emissionSlider.addEventListener("input", () => {
  render(Number(emissionSlider.value));
});

render(Number(emissionSlider.value));
