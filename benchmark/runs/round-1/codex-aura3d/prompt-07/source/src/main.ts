import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  primitives,
  scene,
} from "@aura3d/engine";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (appRoot) {
  appRoot.innerHTML = `
    <div class="lab-shell">
      <div class="label-strip" aria-hidden="true">
        <span>Metal</span>
        <span>Glass</span>
        <span>Rubber</span>
        <span>Emissive</span>
        <span>Clearcoat</span>
      </div>
    </div>
  `;
}

const style = document.createElement("style");
style.textContent = `
  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #05070b;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .lab-shell {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .lab-shell canvas {
    width: 100%;
    height: 100%;
  }

  .label-strip {
    position: absolute;
    left: 50%;
    bottom: 20px;
    display: grid;
    grid-template-columns: repeat(5, minmax(64px, 1fr));
    width: min(760px, calc(100vw - 32px));
    transform: translateX(-50%);
    color: rgba(235, 243, 255, 0.78);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0;
    text-align: center;
    pointer-events: none;
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.95);
  }
`;
document.head.append(style);

const labScene = scene()
  .background("#070b12")
  .camera(camera.orbit({ distance: 6.15, target: [0, 0.58, -0.32], fov: 42 }))
  .add(
    primitives.plane({
      name: "glossy graphite studio floor",
      material: material.pbr({ color: "#171b1f", roughness: 0.18, metallic: 0.22 }),
    })
      .position(0, -0.08, -0.42)
      .scale([8.4, 1, 4.3]),
  )
  .add(
    primitives.plane({
      name: "cool gradient rear wall",
      material: material.emissive({ color: "#0a1018", emissive: "#111f2d", roughness: 0.42 }),
    })
      .position(0, 1.18, -2.55)
      .rotate(1.5708, 0, 0)
      .scale([8.4, 1, 3.2]),
  )
  .add(
    primitives.box({
      name: "left white softbox reflection card",
      material: material.emissive({ color: "#eef6ff", emissive: "#f5fbff", roughness: 0.12 }),
    })
      .position(-4.05, 1.15, -0.92)
      .rotate(0, 0.28, 0)
      .scale([0.1, 1.72, 1.65]),
  )
  .add(
    primitives.box({
      name: "right warm softbox reflection card",
      material: material.emissive({ color: "#ffd9a3", emissive: "#ffd8a0", roughness: 0.18 }),
    })
      .position(4.05, 0.96, -0.98)
      .rotate(0, -0.28, 0)
      .scale([0.1, 1.38, 1.5]),
  )
  .add(
    primitives.box({
      name: "overhead strip softbox",
      material: material.emissive({ color: "#f7fbff", emissive: "#ffffff", roughness: 0.1 }),
    })
      .position(0, 2.28, -0.92)
      .rotate(0.04, 0, 0)
      .scale([3.5, 0.07, 0.12]),
  )
  .add(
    primitives.box({
      name: "blue environment reflection band",
      material: material.emissive({ color: "#2f77a8", emissive: "#3c9dcc", roughness: 0.16 }),
    })
      .position(-1.7, 0.04, 0.92)
      .rotate(0, 0.14, 0)
      .scale([1.75, 0.035, 0.18]),
  )
  .add(
    primitives.box({
      name: "amber environment reflection band",
      material: material.emissive({ color: "#a76f39", emissive: "#cf8c4a", roughness: 0.2 }),
    })
      .position(1.85, 0.035, 0.8)
      .rotate(0, -0.12, 0)
      .scale([1.85, 0.035, 0.18]),
  )
  .add(
    primitives.sphere({
      name: "metal material sphere",
      material: material.pbr({ color: "#d7dee7", roughness: 0.12, metallic: 1 }),
    })
      .position(-3.0, 0.52, -0.34)
      .scale(0.74),
  )
  .add(
    primitives.sphere({
      name: "glass material sphere",
      material: material.pbr({ color: "#bfeaff", roughness: 0.03, metallic: 0.04 }),
    })
      .position(-1.5, 0.52, -0.34)
      .scale(0.74),
  )
  .add(
    primitives.sphere({
      name: "rubber material sphere",
      material: material.pbr({ color: "#1f2429", roughness: 0.94, metallic: 0 }),
    })
      .position(0, 0.52, -0.34)
      .scale(0.74),
  )
  .add(
    primitives.sphere({
      name: "emissive material sphere",
      material: material.emissive({ color: "#ff38c8", emissive: "#ff4fd6", roughness: 0.22, metallic: 0 }),
    })
      .position(1.5, 0.52, -0.34)
      .scale(0.74),
  )
  .add(
    primitives.sphere({
      name: "clearcoat material sphere",
      material: material.pbr({ color: "#d9242f", roughness: 0.05, metallic: 0.02 }),
    })
      .position(3.0, 0.52, -0.34)
      .scale(0.74),
  )
  .add(
    primitives.box({
      name: "five-swatch contact shadow",
      material: material.pbr({ color: "#030406", roughness: 0.9, metallic: 0 }),
    })
      .position(0, 0.015, -0.32)
      .scale([6.75, 0.022, 0.56]),
  )
  .add(lights.studio({ intensity: 1.18 }))
  .add(lights.ambient({ name: "controlled low fill", color: "#b7d5ff", intensity: 0.16 }))
  .add(lights.point({ name: "left softbox light", position: [-3.6, 2.25, 1.35], color: "#f2f8ff", intensity: 2.3 }))
  .add(lights.point({ name: "warm rim light", position: [3.5, 1.6, 1.05], color: "#ffc783", intensity: 1.18 }))
  .add(lights.directional({ name: "overhead strip key", position: [0.15, 4.5, 2.4], color: "#ffffff", intensity: 1.35 }))
  .add(effects.bloom({ intensity: 0.32, color: "#ffd6f2" }))
  .add(interactions.orbit({ target: "material lab" }));

createAuraApp(".lab-shell", {
  scene: labScene,
  diagnostics: false,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
});
