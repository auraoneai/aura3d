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
import "./style.css";

const planets = [
  { name: "Aster", radius: 1.05, size: 0.11, color: "#60a5fa", z: 0.1, speed: 0.52 },
  { name: "Vela", radius: 1.55, size: 0.14, color: "#f97316", z: -0.28, speed: 0.42 },
  { name: "Oryn", radius: 2.1, size: 0.12, color: "#a78bfa", z: 0.34, speed: 0.32 },
  { name: "Mira", radius: 2.75, size: 0.18, color: "#34d399", z: -0.18, speed: 0.24 },
  { name: "Cael", radius: 3.35, size: 0.16, color: "#facc15", z: 0.42, speed: 0.18 },
  { name: "Nysa", radius: 4.05, size: 0.21, color: "#f9a8d4", z: -0.36, speed: 0.13 }
] as const;

const orbitDots = planets.flatMap((planet) =>
  Array.from({ length: 28 }, (_, index) => {
    const angle = (index / 28) * Math.PI * 2;

    return primitives
      .box({
        material: material.emissive({
          color: "#dbeafe",
          emissive: "#93c5fd",
          opacity: 0.42
        })
      })
      .position(Math.cos(angle) * planet.radius, -0.015, Math.sin(angle) * planet.radius)
      .scale([0.018, 0.006, 0.018])
      .toJSON();
  })
) satisfies AuraSceneNode[];

const planetNodes = planets.map((planet, index) =>
  primitives
    .sphere({ material: material.clearcoat({ color: planet.color, clearcoat: 0.85 }) })
    .position(planet.radius, 0, planet.z)
    .scale(planet.size)
    .animate({ clip: "float", speed: planet.speed })
    .toJSON()
) satisfies AuraSceneNode[];

document.querySelector<HTMLDivElement>("#app")!.insertAdjacentHTML(
  "afterend",
  `<div class="labels" aria-label="planet labels">
    ${planets
      .map(
        (planet, index) =>
          `<span class="planet-label label-${index + 1}">${planet.name}</span>`
      )
      .join("")}
  </div>`
);

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(orbitDots)
    .add(
      primitives
        .sphere({
          material: material.emissive({
            color: "#ffd166",
            emissive: "#ffb703",
            roughness: 0.12
          })
        })
        .scale(0.46)
        .animate({ clip: "pulse", speed: 0.32 })
    )
    .addMany(planetNodes)
    .add(lights.ambient({ intensity: 0.25, color: "#8ecaff" }))
    .add(lights.point({ position: [0, 0, 0], color: "#ffd166", intensity: 2.8 }))
    .add(effects.bloom({ intensity: 0.58, radius: 0.85 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 6.8, target: [1.75, 0, 0], fov: 48 }))
    .timeline(timeline.loop({ seconds: 14 }))
});
