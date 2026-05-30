import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";

type Planet = {
  name: string;
  radius: number;
  size: number;
  speed: number;
  color: `#${string}`;
  y: number;
};

const planets: Planet[] = [
  { name: "Aster", radius: 1.55, size: 0.16, speed: 1.9, color: "#8fd3ff", y: 0.02 },
  { name: "Vela", radius: 2.25, size: 0.22, speed: 1.45, color: "#f0b36b", y: -0.02 },
  { name: "Nereid", radius: 3.05, size: 0.25, speed: 1.05, color: "#64d6a3", y: 0.03 },
  { name: "Orin", radius: 3.9, size: 0.31, speed: 0.78, color: "#d88cff", y: -0.03 },
  { name: "Calyx", radius: 4.8, size: 0.36, speed: 0.55, color: "#f4d35e", y: 0.04 },
  { name: "Iris", radius: 5.75, size: 0.29, speed: 0.36, color: "#7da7ff", y: -0.04 }
];

const planetNodes = planets.flatMap((planet, index) => {
  const angle = index * 0.72 + 0.32;
  const x = Math.cos(angle) * planet.radius;
  const z = Math.sin(angle) * planet.radius;

  return [
    primitives.cylinder({
      name: `${planet.name} orbit radius ${planet.radius}`,
      position: [0, -0.035 - index * 0.006, 0],
      size: [planet.radius * 2, 0.006, planet.radius * 2],
      material: material.glass({
        color: "#b7c7d8",
        opacity: 0.08,
        transmission: 0.35,
        roughness: 0.18
      })
    }),
    primitives.sphere({
      name: `${planet.name} speed ${planet.speed.toFixed(2)}`,
      position: [x, planet.y, z],
      size: planet.size * 2,
      material: material.clearcoat({
        color: planet.color,
        roughness: 0.24,
        clearcoat: 0.85
      })
    }).animate({ clip: "spin", speed: planet.speed })
  ];
});

const solarScene = scene()
  .background("#020611")
  .add(
    primitives.sphere({
      name: "Sun - emissive bloom anchor",
      position: [0, 0, 0],
      size: 0.94,
      material: material.emissive({
        color: "#ffd36a",
        emissive: "#ff9f1c",
        roughness: 0.12
      })
    }).animate({ clip: "pulse", speed: 1.2 })
  )
  .addMany(planetNodes)
  .add(lights.ambient({ intensity: 0.24, color: "#d7ecff" }))
  .add(lights.point({ position: [0, 0, 0], intensity: 5.2, color: "#ffc46b" }))
  .add(lights.directional({ position: [-3.2, 4.4, 3.6], intensity: 0.85, color: "#ffffff" }))
  .add(effects.bloom({ intensity: 1.15, color: "#ffb238" }))
  .add(interactions.orbit())
  .camera(camera.orbit({ distance: 8.8, target: [0, 0, 0], fov: 50 }))
  .timeline(timeline.loop({ seconds: 12 }));

const appRoot = document.querySelector<HTMLElement>("#app");

if (appRoot) {
  appRoot.innerHTML = `
    <div id="scene"></div>
    <div class="system-title">Procedural Solar System</div>
    <div class="speed-key">Orbital speed: inner planets faster, outer planets slower</div>
    <div class="labels">
      ${planets
        .map((planet, index) => {
          const left = 50 + Math.cos(index * 0.72 + 0.32) * (planet.radius / 6.35) * 41;
          const top = 50 + Math.sin(index * 0.72 + 0.32) * (planet.radius / 6.35) * 28;
          return `<div class="planet-label" style="left:${left.toFixed(2)}%;top:${top.toFixed(
            2
          )}%">${planet.name}<span>${planet.speed.toFixed(2)}x</span></div>`;
        })
        .join("")}
    </div>
  `;
}

createAuraApp("#scene", {
  diagnostics: false,
  pixelRatio: 1.5,
  scene: solarScene
});
