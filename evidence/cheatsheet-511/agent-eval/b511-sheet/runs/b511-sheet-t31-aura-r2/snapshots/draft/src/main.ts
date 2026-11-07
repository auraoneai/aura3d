import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

interface Planet {
  id: string;
  size: number;
  color: string;
  radius: number;
  speed: number; // rad/s
  phase: number;
  roughness: number;
  ring?: boolean;
}

const PLANETS: Planet[] = [
  { id: "mercury", size: 0.5, color: "#b5a89a", radius: 3, speed: 1.2, phase: 0.5, roughness: 0.9 },
  { id: "venus", size: 0.9, color: "#e8c27a", radius: 4.8, speed: 0.8, phase: 2.2, roughness: 0.7 },
  { id: "earth", size: 1.0, color: "#3d7ee0", radius: 6.8, speed: 0.55, phase: 4.0, roughness: 0.6 },
  { id: "mars", size: 0.7, color: "#d2552f", radius: 8.6, speed: 0.4, phase: 1.1, roughness: 0.85 },
  { id: "saturn", size: 1.7, color: "#d9b878", radius: 11, speed: 0.26, phase: 5.2, roughness: 0.6, ring: true }
];

const RING_TILT = 0.35;

// Faint orbit guides: thin flat tori in the XZ plane (torus axis is local Z, so rotate X by 90 degrees).
const orbitGuide = (p: Planet) =>
  primitives
    .torus({
      name: `orbit-${p.id}`,
      size: [(p.radius * 2) / 0.86, (p.radius * 2) / 0.86, (p.radius * 2) / 0.86],
      params: { tube: 0.0012 },
      castShadow: false,
      receiveShadow: false,
      material: material.emissive({ color: "#223046", emissive: "#3a4f73", emissiveIntensity: 0.35 })
    })
    .rotate(Math.PI / 2, 0, 0);

const stage = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.12, background: false }))
  .add(lights.point({ name: "star-light", position: [0, 0, 0], intensity: 400, color: "#ffd9a0", distance: 60, decay: 2, shadow: false }))
  .add(
    primitives
      .sphere({
        name: "star",
        size: 2.6,
        castShadow: false,
        material: material.emissive({ color: "#ffcc66", emissive: "#ffa63d", emissiveIntensity: 3 })
      })
      .runtime({ id: "star", mutable: true })
  )
  .add(effects.bloom({ intensity: 1.1, threshold: 0.7, radius: 0.7 }));

for (const p of PLANETS) {
  stage.add(orbitGuide(p));
  stage.add(
    primitives
      .sphere({
        name: p.id,
        size: p.size,
        material: material.pbr({ color: p.color, roughness: p.roughness, metallic: 0 })
      })
      .position(Math.cos(p.phase) * p.radius, 0, Math.sin(p.phase) * p.radius)
      .runtime({ id: p.id, mutable: true })
  );
  if (p.ring) {
    // Torus major radius is 0.43 * size.x, so size.x = 2 * ringRadius / 0.86.
    const ringRadius = p.size * 1.15;
    const d = (ringRadius * 2) / 0.86;
    stage.add(
      primitives
        .torus({
          name: `${p.id}-ring`,
          size: [d, d, 0.12],
          params: { tube: 0.14 },
          castShadow: false,
          material: material.pbr({ color: "#cdb48a", roughness: 0.5, metallic: 0 })
        })
        .position(Math.cos(p.phase) * p.radius, 0, Math.sin(p.phase) * p.radius)
        .rotate(Math.PI / 2 + RING_TILT, 0, 0)
        .runtime({ id: `${p.id}-ring`, mutable: true })
    );
  }
}

stage.camera(camera.perspective({ position: [0, 15, 19], target: [0, 0, 0], fov: 45, near: 0.5, far: 200 }));

const app = createAuraApp("#app", { scene: stage });

app.onFrame((f) => {
  for (const p of PLANETS) {
    const a = p.phase + f.time * p.speed;
    const x = Math.cos(a) * p.radius;
    const z = Math.sin(a) * p.radius;
    app.nodes.require(p.id).setPosition(x, 0, z).setRotation(0, f.time * 0.8, 0);
    if (p.ring) app.nodes.require(`${p.id}-ring`).setPosition(x, 0, z);
  }
  app.nodes.require("star").setRotation(0, f.time * 0.2, 0);
});

await app.ready();
window.__EVAL_READY__ = true;
