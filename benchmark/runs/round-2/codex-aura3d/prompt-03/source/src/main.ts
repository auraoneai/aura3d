import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  primitives,
  scene,
  timeline,
  type AuraSceneNode
} from "@aura3d/engine";

const planets = [
  { name: "Mercury", radius: 1.75, size: 0.13, color: "#b9a58f", speed: "4.1x" },
  { name: "Venus", radius: 2.55, size: 0.2, color: "#e7ba65", speed: "3.1x" },
  { name: "Terra", radius: 3.45, size: 0.22, color: "#49a2ff", speed: "2.4x" },
  { name: "Ares", radius: 4.45, size: 0.18, color: "#d66b45", speed: "1.8x" },
  { name: "Jovia", radius: 5.85, size: 0.38, color: "#d8b07d", speed: "1.1x" },
  { name: "Nereid", radius: 7.25, size: 0.31, color: "#63d1d8", speed: "0.7x" }
] as const;

const planetAngles = [-0.34, 0.48, -0.72, 0.28, -0.2, 0.14] as const;

function orbitDots(radius: number, color: string): AuraSceneNode[] {
  return Array.from({ length: 72 }, (_, index) => {
    const angle = (index / 72) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    return primitives
      .sphere({
        name: `orbit-${radius.toFixed(2)}-${index}`,
        size: 0.018,
        material: material.emissive({
          name: "soft orbit marker",
          color,
          emissive: color,
          opacity: index % 2 === 0 ? 0.5 : 0.26,
          roughness: 0.8
        })
      })
      .position(x, -0.035, z)
      .toJSON();
  });
}

const planetNodes = planets.map((planet, index) => {
  const angle = planetAngles[index];
  const x = Math.cos(angle) * planet.radius;
  const z = Math.sin(angle) * planet.radius;

  return primitives
    .sphere({
      name: planet.name,
      size: planet.size,
      material: material.pbr({
        name: `${planet.name} surface`,
        color: planet.color,
        roughness: 0.42,
        metallic: 0.03,
        emissive: planet.color
      })
    })
    .position(x, 0, z)
    .animate({ clip: "float", speed: Number.parseFloat(planet.speed) * 0.18 })
    .toJSON();
});

const orbitNodes = planets.flatMap((planet) => orbitDots(planet.radius, "#5f8cff"));

const solarSystem = scene()
  .background("#02040c")
  .add(
    primitives.sphere({
      name: "Sun",
      size: 0.8,
      material: material.emissive({
        name: "solar plasma",
        color: "#ffd15a",
        emissive: "#ff9f24",
        roughness: 0.18
      })
    })
  )
  .add(
    primitives.sphere({
      name: "solar bloom halo",
      size: 1.24,
      material: material.emissive({
        name: "transparent solar glow",
        color: "#ffb03a",
        emissive: "#ff7a18",
        opacity: 0.2
      })
    })
  )
  .add(
    primitives.sphere({
      name: "outer solar corona",
      size: 1.72,
      material: material.emissive({
        name: "wide amber corona",
        color: "#ff6b22",
        emissive: "#ff5a18",
        opacity: 0.1
      })
    })
  )
  .addMany(orbitNodes)
  .addMany(planetNodes)
  .add(lights.ambient({ intensity: 0.18, color: "#8ca7ff" }))
  .add(lights.point({ name: "solar core light", position: [0, 0.2, 0], intensity: 8, color: "#ffcc68" }))
  .add(lights.directional({ position: [-4, 5, 5], intensity: 0.65, color: "#d8e5ff" }))
  .add(effects.bloom({ name: "visible sun bloom", intensity: 0.74, radius: 1.4 }))
  .add(effects.fog({ density: 0.018, color: "#061026" }))
  .add(interactions.orbit({ target: "Sun" }))
  .camera(camera.orbit({ distance: 11.2, target: [0, 0, 0], position: [0, 5.8, 10.4], fov: 50 }))
  .timeline(timeline.loop({ seconds: 18 }));

const style = document.createElement("style");
style.textContent = `
  :root {
    color-scheme: dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #02040c;
  }

  body {
    margin: 0;
    min-width: 320px;
    overflow: hidden;
    background: #02040c;
  }

  #app {
    width: 100vw;
    height: 100vh;
  }

  .solar-labels {
    position: fixed;
    inset: 0;
    z-index: 5;
    pointer-events: none;
  }

  .planet-label {
    position: absolute;
    min-width: 4.25rem;
    transform: translate(-50%, -50%);
    padding: 0.22rem 0.42rem;
    border: 1px solid rgba(198, 220, 255, 0.55);
    border-radius: 6px;
    background: rgba(3, 8, 20, 0.76);
    box-shadow: 0 0 18px rgba(105, 154, 255, 0.22);
    color: #f4f8ff;
    text-align: center;
    text-shadow: 0 1px 2px #000;
    white-space: nowrap;
    backdrop-filter: blur(4px);
  }

  .planet-label strong,
  .sun-label strong {
    display: block;
    font-size: clamp(0.67rem, 1.3vw, 0.86rem);
    font-weight: 760;
    letter-spacing: 0;
    line-height: 1.05;
  }

  .planet-label span,
  .sun-label span {
    display: block;
    margin-top: 0.14rem;
    color: #a9c2ff;
    font-size: clamp(0.54rem, 1vw, 0.68rem);
    line-height: 1;
  }

  .sun-label {
    position: absolute;
    left: 50%;
    top: 48%;
    transform: translate(-50%, -50%);
    padding: 0.24rem 0.48rem;
    border: 1px solid rgba(255, 211, 103, 0.68);
    border-radius: 6px;
    background: rgba(32, 14, 2, 0.62);
    box-shadow: 0 0 30px rgba(255, 150, 34, 0.45);
    color: #fff3c0;
    text-align: center;
    text-shadow: 0 1px 3px #000;
    white-space: nowrap;
    backdrop-filter: blur(3px);
  }
`;
document.head.append(style);

createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: false },
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  scene: solarSystem
});

const labelLayer = document.createElement("div");
labelLayer.className = "solar-labels";
labelLayer.innerHTML = `
  <div class="sun-label"><strong>Sun</strong><span>bloom core</span></div>
  ${planets
    .map((planet, index) => {
      const left = 50 + Math.cos(planetAngles[index]) * planet.radius * 5.25;
      const top = 48 + Math.sin(planetAngles[index]) * planet.radius * 2.55 - 7;

      return `<div class="planet-label" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%">
        <strong>${planet.name}</strong><span>${planet.speed} orbit</span>
      </div>`;
    })
    .join("")}
`;
document.body.append(labelLayer);
