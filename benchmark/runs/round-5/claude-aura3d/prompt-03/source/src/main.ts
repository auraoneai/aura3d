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
import "./style.css";

// 6 planets at visibly different orbital distances and speeds.
const planets = [
  { name: "Mercury", color: "#9ca3af", distance: 0.95, scale: 0.09, speed: 0.55 },
  { name: "Venus", color: "#f59e0b", distance: 1.45, scale: 0.14, speed: 0.44 },
  { name: "Earth", color: "#60a5fa", distance: 2.0, scale: 0.15, speed: 0.36 },
  { name: "Mars", color: "#f97316", distance: 2.55, scale: 0.12, speed: 0.3 },
  { name: "Jupiter", color: "#d97706", distance: 3.25, scale: 0.26, speed: 0.22 },
  { name: "Saturn", color: "#fbbf24", distance: 3.95, scale: 0.22, speed: 0.16 }
] as const;

const solarSystem = scene()
  .background("#020617")
  // Sun: emissive core that drives the bloom glow.
  .add(
    primitives
      .sphere({ material: material.emissive({ color: "#ffd166", emissive: "#ffb703" }) })
      .scale(0.5)
  );

// Add each planet at its orbital distance with its own float speed.
for (const planet of planets) {
  solarSystem.add(
    primitives
      .sphere({ material: material.clearcoat({ color: planet.color }) })
      .position(planet.distance, 0, 0)
      .scale(planet.scale)
      .animate({ clip: "float", speed: planet.speed })
  );
}

solarSystem
  .add(effects.bloom({ intensity: 0.42 }))
  .add(lights.studio({ intensity: 1.1 }))
  .add(interactions.orbit())
  // Orbit camera framed to take in the sun and the outermost planet.
  .camera(camera.orbit({ distance: 8.2, target: [0, 0, 0] }))
  .timeline(timeline.loop({ seconds: 12 }));

createAuraApp("#app", { scene: solarSystem });

// Readable planet labels rendered as a CSS overlay legend.
const legend = document.createElement("div");
legend.className = "legend";
legend.innerHTML = `
  <h1>Procedural Solar System</h1>
  <ul>
    <li><span class="dot" style="background:#ffd166"></span>Sun</li>
    ${planets
      .map(
        (p) =>
          `<li><span class="dot" style="background:${p.color}"></span>${p.name}</li>`
      )
      .join("")}
  </ul>
`;
document.body.appendChild(legend);
