import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

interface PlanetSpec {
  readonly id: string;
  readonly radius: number; // visual radius (sphere diameter = 2 * radius)
  readonly orbit: number; // orbit radius
  readonly speed: number; // radians per second
  readonly phase: number;
  readonly color: string;
  readonly roughness: number;
  readonly ring?: { readonly inner: number; readonly outer: number; readonly color: string };
}

const planets: readonly PlanetSpec[] = [
  { id: "ember", radius: 0.32, orbit: 3.4, speed: 1.25, phase: 0.4, color: "#c9a27a", roughness: 0.85 },
  { id: "coral", radius: 0.5, orbit: 5.2, speed: 0.8, phase: 2.3, color: "#e0643c", roughness: 0.7 },
  { id: "azure", radius: 0.62, orbit: 7.2, speed: 0.55, phase: 4.1, color: "#3f86e8", roughness: 0.5 },
  { id: "saturn", radius: 0.95, orbit: 9.2, speed: 0.36, phase: 1.2, color: "#e6c27a", roughness: 0.6, ring: { inner: 1.35, outer: 2.1, color: "#cdb48a" } },
  { id: "jade", radius: 0.5, orbit: 11, speed: 0.24, phase: 5.4, color: "#4fc48a", roughness: 0.6 }
];

const RING_TILT = 0.38;
const planetPosition = (p: PlanetSpec, t: number): [number, number, number] => {
  const a = p.phase + p.speed * t;
  return [Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit];
};

// Seeded background stars on a far sphere.
let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const stars: AuraTransformSpec[] = [];
for (let i = 0; i < 220; i += 1) {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const d = 90;
  const size = 0.12 + rand() * 0.22;
  stars.push({ position: [Math.cos(phi) * s * d, Math.abs(u) * d * 0.9 - 20, Math.sin(phi) * s * d], scale: [size, size, size] });
}

const stage = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.3, background: false }))
  .add(lights.point({ name: "star-light", position: [0, 0, 0], intensity: 45, color: "#fff0d0", distance: 60, decay: 1, shadow: false }))
  .add(lights.directional({ name: "fill", position: [-6, 14, 8], target: [0, 0, 0], intensity: 0.5, color: "#8fa8ff" }))
  .add(instances.sphere({ name: "stars", transforms: stars, material: material.emissive({ color: "#ffffff", emissive: "#cfd8ff", emissiveIntensity: 1 }) }))
  .add(primitives.sphere({ name: "star", size: 2.4, material: material.emissive({ color: "#ffd27a", emissive: "#ffb347", emissiveIntensity: 3.5 }) }))
  .add(effects.bloom({ intensity: 1.1, threshold: 0.6, radius: 0.7 }))
  .camera(camera.perspective({ position: [0, 17, 18], target: [0, 0, 0], fov: 45, near: 0.5, far: 250 }));

for (const p of planets) {
  const [x, y, z] = planetPosition(p, 0);
  stage.add(
    primitives.ring({
      name: `orbit-${p.id}`,
      params: { innerRadius: p.orbit - 0.025, outerRadius: p.orbit + 0.025, thetaSegments: 128 },
      material: material.emissive({ color: "#1c2a44", emissive: "#2b3f66", emissiveIntensity: 0.5, doubleSided: true })
    }).rotate(-Math.PI / 2, 0, 0)
  );
  stage.add(
    primitives.sphere({
      name: p.id,
      size: p.radius * 2,
      material: material.pbr({ color: p.color, roughness: p.roughness, metallic: 0 })
    }).position(x, y, z).runtime({ id: p.id, mutable: true })
  );
  if (p.ring) {
    stage.add(
      primitives.ring({
        name: `${p.id}-ring`,
        params: { innerRadius: p.ring.inner, outerRadius: p.ring.outer, thetaSegments: 96 },
        material: material.pbr({ color: p.ring.color, roughness: 0.8, metallic: 0, doubleSided: true })
      }).position(x, y, z).rotate(-Math.PI / 2 + RING_TILT, 0, 0.25).runtime({ id: `${p.id}-ring`, mutable: true })
    );
  }
}

const app = createAuraApp("#app", { scene: stage });

let elapsed = 0;
app.onFrame((frame) => {
  elapsed += frame.dt;
  for (const p of planets) {
    const [x, y, z] = planetPosition(p, elapsed);
    app.nodes.require(p.id).setPosition(x, y, z);
    if (p.ring) app.nodes.require(`${p.id}-ring`).setPosition(x, y, z);
  }
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
