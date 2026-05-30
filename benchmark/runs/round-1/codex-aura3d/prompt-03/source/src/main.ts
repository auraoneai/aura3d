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

type Planet = {
  name: string;
  radius: number;
  size: number;
  angle: number;
  speed: string;
  color: string;
  emissive?: string;
  labelLeft: string;
  labelTop: string;
};

const planets: Planet[] = [
  { name: "Aster", radius: 1.45, size: 0.18, angle: 0.12, speed: "4.8x", color: "#b9c5d6", labelLeft: "57%", labelTop: "48%" },
  { name: "Vesta", radius: 2.25, size: 0.24, angle: 3.55, speed: "3.6x", color: "#e6b16d", labelLeft: "39%", labelTop: "53%" },
  { name: "Cyra", radius: 3.25, size: 0.27, angle: 0.72, speed: "2.7x", color: "#55b8ff", emissive: "#1d6cff", labelLeft: "66%", labelTop: "42%" },
  { name: "Neris", radius: 4.35, size: 0.22, angle: 3.03, speed: "1.9x", color: "#d76549", labelLeft: "28%", labelTop: "46%" },
  { name: "Juno", radius: 5.9, size: 0.44, angle: -0.28, speed: "1.1x", color: "#d6b18a", labelLeft: "78%", labelTop: "55%" },
  { name: "Orin", radius: 7.35, size: 0.34, angle: 3.23, speed: "0.7x", color: "#9fd4d2", emissive: "#3f878d", labelLeft: "13%", labelTop: "50%" }
];

const orbitMaterial = material.emissive({
  color: "#36506f",
  emissive: "#4a7eb8",
  roughness: 0.4
});

const solarScene = scene()
  .background("#02040b")
  .add(primitives.sphere({
    name: "Sun - emissive procedural star",
    material: material.emissive({ color: "#ffb01f", emissive: "#ffdd57", roughness: 0.18 })
  }).position(0, 0, 0).scale(0.78))
  .add(primitives.sphere({
    name: "Sun inner white-hot core",
    material: material.emissive({ color: "#fff3a0", emissive: "#fff3a0", roughness: 0.08 })
  }).position(0, 0, 0).scale(0.42))
  .add(lights.ambient({ intensity: 0.08, color: "#9db8ff" }))
  .add(lights.point({ name: "sun point light", position: [0, 0.25, 0], color: "#ffd46b", intensity: 4.8 }))
  .add(effects.bloom({ intensity: 0.86, color: "#ffd46b" }))
  .add(interactions.orbit({ target: "Sun - emissive procedural star" }))
  .camera(camera.orbit({ distance: 13.5, target: [0, 0, 0], fov: 52 }))
  .timeline(timeline.loop({ seconds: 14 }));

for (const planet of planets) {
  const x = Math.cos(planet.angle) * planet.radius;
  const y = Math.sin(planet.angle) * planet.radius * 0.34;
  const z = Math.sin(planet.angle) * planet.radius * 0.08;

  solarScene.add(primitives.sphere({
    name: `${planet.name} planet - orbital speed ${planet.speed}`,
    material: planet.emissive
      ? material.emissive({ color: planet.color, emissive: planet.emissive, roughness: 0.32 })
      : material.pbr({ color: planet.color, roughness: 0.42, metallic: 0.04 })
  }).position(x, y, z).scale(planet.size));

  if (planet.name === "Juno") {
    solarScene.add(primitives.sphere({
      name: "Juno pale storm band",
      material: material.emissive({ color: "#f2d2a0", emissive: "#b88f5e" })
    }).position(x, y + 0.02, z).scale([planet.size * 1.08, planet.size * 0.16, planet.size * 1.08]));
  }
}

for (const planet of planets) {
  const segments = 56;

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const nextAngle = ((index + 0.7) / segments) * Math.PI * 2;
    const x1 = Math.cos(angle) * planet.radius;
    const y1 = Math.sin(angle) * planet.radius * 0.34;
    const z1 = Math.sin(angle) * planet.radius * 0.08;
    const x2 = Math.cos(nextAngle) * planet.radius;
    const y2 = Math.sin(nextAngle) * planet.radius * 0.34;
    const z2 = Math.sin(nextAngle) * planet.radius * 0.08;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const midZ = (z1 + z2) / 2;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const roll = Math.atan2(y2 - y1, x2 - x1);

    solarScene.add(primitives.box({
      name: `${planet.name} orbit distance ring ${index + 1}`,
      material: orbitMaterial
    }).position(midX, midY, midZ).rotate(0, 0, roll).scale([length, 0.012, 0.012]));
  }
}

const starMaterial = material.emissive({ color: "#d8e7ff", emissive: "#d8e7ff" });
for (let index = 0; index < 44; index += 1) {
  const x = ((index * 37) % 97) / 97 * 17 - 8.5;
  const y = ((index * 23) % 59) / 59 * 4.6 - 0.9;
  const z = -5.2 - ((index * 17) % 43) / 43 * 2.2;

  solarScene.add(primitives.sphere({
    name: `procedural background star ${index + 1}`,
    material: starMaterial
  }).position(x, y, z).scale(index % 5 === 0 ? 0.035 : 0.022));
}

createAuraApp("#app", {
  diagnostics: false,
  scene: solarScene
});

const labelLayer = document.createElement("div");
labelLayer.className = "planet-labels";
for (const planet of planets) {
  const label = document.createElement("div");
  label.className = "planet-label";
  label.style.left = planet.labelLeft;
  label.style.top = planet.labelTop;
  label.textContent = `${planet.name}  ${planet.speed}`;
  labelLayer.append(label);
}
document.querySelector("#app")?.append(labelLayer);
