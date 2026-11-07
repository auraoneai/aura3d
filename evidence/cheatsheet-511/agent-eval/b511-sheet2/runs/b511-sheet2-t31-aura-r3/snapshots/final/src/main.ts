import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

interface PlanetSpec {
  id: string;
  size: number;
  color: string;
  radius: number;
  speed: number; // radians per second
  phase: number;
  roughness: number;
}

const planets: PlanetSpec[] = [
  { id: "mercury", size: 0.45, color: "#b5a79a", radius: 2.8, speed: 1.3, phase: 0.5, roughness: 0.9 },
  { id: "venus", size: 0.8, color: "#e8b66a", radius: 4.4, speed: 0.95, phase: 2.4, roughness: 0.7 },
  { id: "terra", size: 0.9, color: "#3f86d9", radius: 6.2, speed: 0.7, phase: 4.1, roughness: 0.5 },
  { id: "saturn", size: 1.5, color: "#d9b27c", radius: 8.4, speed: 0.45, phase: 1.2, roughness: 0.6 },
  { id: "ice", size: 1.1, color: "#6fd3d0", radius: 10.4, speed: 0.3, phase: 5.3, roughness: 0.5 }
];
const ringed = "saturn";
const RING_TILT = 0.4;

const stage = scene({ background: "#03040a" })
  .add(environments.neutral({ intensity: 0.15, background: false }))
  .add(lights.point({ name: "sunlight", position: [0, 0, 0], intensity: 400, distance: 60, decay: 2, color: "#fff1d0", shadow: false }))
  .add(
    primitives
      .sphere({
        name: "star",
        size: 2.2,
        material: material.emissive({ color: "#ffcc66", emissive: "#ffaa33", emissiveIntensity: 3 })
      })
      .position(0, 0, 0)
  )
  .add(effects.bloom({ intensity: 1.1, threshold: 0.7, radius: 0.7 }))
  .camera(camera.perspective({ position: [0, 15, 17], target: [0, 0, 0], fov: 45, near: 0.1, far: 200 }));

for (const p of planets) {
  stage.add(
    primitives
      .sphere({ name: p.id, size: p.size, material: material.pbr({ color: p.color, roughness: p.roughness }) })
      .position(Math.cos(p.phase) * p.radius, 0, Math.sin(p.phase) * p.radius)
      .runtime({ id: p.id, mutable: true })
  );
}

const ringPlanet = planets.find((p) => p.id === ringed);
if (ringPlanet) {
  stage.add(
    primitives
      .torus({
        name: "ring",
        size: [ringPlanet.size * 2.1, ringPlanet.size * 2.1, 0.15],
        material: material.pbr({ color: "#e9d9b0", roughness: 0.6 })
      })
      .position(Math.cos(ringPlanet.phase) * ringPlanet.radius, 0, Math.sin(ringPlanet.phase) * ringPlanet.radius)
      .runtime({ id: "ring", mutable: true })
  );
}

const app = createAuraApp("#app", { scene: stage });

let flagged = false;
app.onFrame((f) => {
  for (const p of planets) {
    const a = p.phase + f.time * p.speed;
    const x = Math.cos(a) * p.radius;
    const z = Math.sin(a) * p.radius;
    app.nodes.require(p.id).setPosition(x, 0, z);
    if (p.id === ringed) {
      app.nodes.require("ring").setPosition(x, 0, z).setRotation(Math.PI / 2 + RING_TILT, 0, 0.2);
    }
  }
  if (!flagged) {
    flagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
