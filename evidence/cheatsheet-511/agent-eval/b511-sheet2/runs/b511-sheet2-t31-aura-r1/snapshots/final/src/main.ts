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
  speed: number;
  phase: number;
  roughness: number;
  ring?: boolean;
}

const PLANETS: PlanetSpec[] = [
  { id: "p1", size: 0.6, color: "#b5a79a", radius: 3.6, speed: 1.3, phase: 0.4, roughness: 0.9 },
  { id: "p2", size: 0.95, color: "#e8b04a", radius: 5.2, speed: 0.95, phase: 2.3, roughness: 0.6 },
  { id: "p3", size: 1.1, color: "#3f86e0", radius: 7.0, speed: 0.7, phase: 4.1, roughness: 0.5 },
  { id: "p4", size: 0.8, color: "#d4552f", radius: 8.8, speed: 0.52, phase: 1.2, roughness: 0.8 },
  { id: "p5", size: 1.5, color: "#d9b88a", radius: 11.0, speed: 0.38, phase: 5.2, roughness: 0.55, ring: true }
];

const RING_ID = "p5-ring";
const RING_TILT = 0.45;

let s = scene({ background: "#03040a" })
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.ambient({ intensity: 0.15 }))
  .add(lights.point({ position: [0, 0, 0], intensity: 400, color: "#fff2d0" }))
  .add(
    primitives
      .sphere({
        name: "star",
        size: 2.6,
        castShadow: false,
        material: material.emissive({ color: "#ffd27a", emissive: "#ffb347", emissiveIntensity: 3 })
      })
      .runtime({ id: "star", mutable: true })
  );

for (const p of PLANETS) {
  const x = Math.cos(p.phase) * p.radius;
  const z = Math.sin(p.phase) * p.radius;
  s = s.add(
    primitives
      .sphere({ name: p.id, size: p.size, material: material.pbr({ color: p.color, roughness: p.roughness }) })
      .position(x, 0, z)
      .runtime({ id: p.id, mutable: true })
  );
  if (p.ring) {
    const d = p.size * 2.3;
    s = s.add(
      primitives
        .torus({
          name: RING_ID,
          size: [d, d, 0.25],
          params: { tube: 0.12 },
          material: material.pbr({ color: "#c9b79a", roughness: 0.7 })
        })
        .position(x, 0, z)
        .rotate(Math.PI / 2 + RING_TILT, 0, 0.3)
        .runtime({ id: RING_ID, mutable: true })
    );
  }
}

// Faint orbit guides so the radii are readable.
for (const p of PLANETS) {
  s = s.add(
    primitives
      .torus({
        name: `${p.id}-orbit`,
        size: [p.radius / 0.43, p.radius / 0.43, 6],
        params: { tube: 0.004 },
        material: material.emissive({ color: "#2a3350", emissive: "#2a3350", emissiveIntensity: 0.6 })
      })
      .rotate(Math.PI / 2, 0, 0)
  );
}

s = s
  .add(effects.bloom({ intensity: 0.9, threshold: 0.7, radius: 0.6 }))
  .camera(camera.perspective({ position: [0, 14, 17], target: [0, 0, 0], fov: 45 }));

const app = createAuraApp("#app", { scene: s });

let first = true;
app.onFrame((f) => {
  for (const p of PLANETS) {
    const a = p.phase + f.time * p.speed * 0.6;
    const x = Math.cos(a) * p.radius;
    const z = Math.sin(a) * p.radius;
    app.nodes.require(p.id).setPosition(x, 0, z).setRotation(0, f.time * 0.8, 0);
    if (p.ring) {
      app.nodes.require(RING_ID).setPosition(x, 0, z);
    }
  }
  app.nodes.require("star").setRotation(0, f.time * 0.2, 0);
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
