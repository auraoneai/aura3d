import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

interface PlanetSpec {
  id: string;
  radius: number; // orbit radius
  size: number; // sphere diameter
  color: string;
  speed: number; // rad/s
  phase: number;
  tilt: number; // orbit plane inclination (rad)
  ring?: boolean;
}

const PLANETS: PlanetSpec[] = [
  { id: "mercurio", radius: 2.6, size: 0.45, color: "#b9a99a", speed: 1.5, phase: 0.4, tilt: 0.0 },
  { id: "venus", radius: 3.9, size: 0.8, color: "#e8b866", speed: 1.0, phase: 2.5, tilt: 0.05 },
  { id: "terra", radius: 5.3, size: 0.95, color: "#3f8fe0", speed: 0.7, phase: 4.4, tilt: -0.04 },
  { id: "saturno", radius: 6.9, size: 1.3, color: "#d9b27a", speed: 0.45, phase: 1.2, tilt: 0.03, ring: true },
  { id: "netuno", radius: 8.5, size: 0.9, color: "#6a5be0", speed: 0.3, phase: 5.4, tilt: -0.05 }
];

const RING_TILT = 0.45;

const planetPos = (p: PlanetSpec, t: number): [number, number, number] => {
  const a = p.phase + p.speed * t;
  const x = Math.cos(a) * p.radius;
  const z = Math.sin(a) * p.radius;
  return [x, Math.sin(a) * p.radius * p.tilt, z];
};

let stage = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.18, background: false }))
  .add(lights.point({ name: "star-light", position: [0, 0, 0], intensity: 900, color: "#fff0cf", distance: 60, decay: 2, shadow: false }))
  .add(
    primitives
      .sphere({
        name: "star",
        size: 2.4,
        material: material.emissive({ color: "#ffd27a", emissive: "#ffb338", emissiveIntensity: 3.5 })
      })
  )
  .add(effects.bloom({ intensity: 1.1, threshold: 0.7, radius: 0.7 }));

for (const p of PLANETS) {
  // faint orbit guide: torus lies in XY, rotate it flat into XZ
  const s = p.radius / 0.43;
  stage = stage.add(
    primitives
      .torus({
        name: `orbit-${p.id}`,
        size: s,
        params: { tube: 0.012 / s },
        material: material.emissive({ color: "#1a2233", emissive: "#3a4a6a", emissiveIntensity: 0.5 }),
        castShadow: false,
        receiveShadow: false
      })
      .rotate(Math.PI / 2, 0, 0)
  );

  const start = planetPos(p, 0);
  stage = stage.add(
    primitives
      .sphere({
        name: p.id,
        size: p.size,
        material: material.pbr({ color: p.color, roughness: 0.6, metallic: 0.05 })
      })
      .position(start[0], start[1], start[2])
      .runtime({ id: p.id, mutable: true })
  );

  if (p.ring) {
    const rs = p.size * 2.3;
    stage = stage.add(
      primitives
        .torus({
          name: `${p.id}-ring`,
          size: [rs, rs, rs * 0.12],
          params: { tube: 0.13 },
          material: material.pbr({ color: "#e6d3a8", roughness: 0.7, metallic: 0.0 }),
          castShadow: false
        })
        .position(start[0], start[1], start[2])
        .rotate(Math.PI / 2 + RING_TILT, 0, 0.3)
        .runtime({ id: `${p.id}-ring`, mutable: true })
    );
  }
}

stage = stage.camera(camera.perspective({ position: [0, 13, 15.5], target: [0, 0, 0], fov: 46, near: 0.1, far: 200 }));

const app = createAuraApp("#app", { scene: stage });

app.onFrame((f) => {
  for (const p of PLANETS) {
    const [x, y, z] = planetPos(p, f.time);
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
