import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

interface PlanetSpec {
  readonly id: string;
  readonly radius: number; // orbit radius
  readonly size: number; // planet diameter
  readonly speed: number; // radians per second
  readonly phase: number;
  readonly color: string;
  readonly roughness: number;
  readonly ring?: boolean;
}

const planets: readonly PlanetSpec[] = [
  { id: "mercury", radius: 2.8, size: 0.5, speed: 1.2, phase: 0.4, color: "#b5a79a", roughness: 0.8 },
  { id: "venus", radius: 4.2, size: 0.9, speed: 0.8, phase: 2.2, color: "#e8b66a", roughness: 0.6 },
  { id: "terra", radius: 5.8, size: 0.85, speed: 0.55, phase: 4.1, color: "#3f7fe0", roughness: 0.5 },
  { id: "saturn", radius: 7.4, size: 1.3, speed: 0.35, phase: 1.3, color: "#d9b27a", roughness: 0.55, ring: true },
  { id: "mars", radius: 9, size: 1.0, speed: 0.22, phase: 5.2, color: "#d4553a", roughness: 0.7 }
];

const positionAt = (p: PlanetSpec, t: number): [number, number, number] => {
  const a = p.phase + p.speed * t;
  return [Math.cos(a) * p.radius, 0, Math.sin(a) * p.radius];
};

const stage = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.3, background: false }))
  .add(lights.point({ name: "star-light", position: [0, 0, 0], intensity: 90, color: "#fff1d0", distance: 60, decay: 2, shadow: false }))
  .add(primitives.sphere({ name: "star", size: 2.2, material: material.emissive({ color: "#ffe9a8", emissive: "#ffb347", emissiveIntensity: 3 }) }))
  .add(effects.bloom({ intensity: 1.1, threshold: 0.6, radius: 0.7 }))
  .camera(camera.perspective({ position: [0, 15, 17], target: [0, 0, 0], fov: 46, near: 0.2, far: 120 }));

// Faint orbit guides: flat tori lying in the orbital plane.
for (const p of planets) {
  const s = p.radius / 0.43;
  stage.add(
    primitives.torus({
      name: `orbit-${p.id}`,
      size: [s, s, s],
      params: { tube: 0.03 / s, radialSegments: 96, tubularSegments: 6 },
      material: material.pbr({ color: "#3a4560", roughness: 1, metallic: 0 })
    }).rotate(Math.PI / 2, 0, 0)
  );
}

for (const p of planets) {
  const [x, y, z] = positionAt(p, 0);
  const children = [
    primitives.sphere({ name: `${p.id}-body`, size: p.size, material: material.pbr({ color: p.color, roughness: p.roughness, metallic: 0 }) })
  ];
  if (p.ring) {
    const s = (p.size * 2.0) / 0.86; // outer ring diameter about twice the planet
    children.push(
      primitives.torus({
        name: `${p.id}-ring`,
        size: [s, s, s * 0.12],
        params: { tube: 0.1, radialSegments: 96, tubularSegments: 8 },
        material: material.pbr({ color: "#e6d3ac", roughness: 0.6, metallic: 0 })
      }).rotate(Math.PI / 2 + 0.45, 0, 0.2)
    );
  }
  stage.add(group(p.id, children, { position: [x, y, z] }).runtime({ id: p.id, mutable: true }));
}

const app = createAuraApp("#app", { scene: stage });

let elapsed = 0;
app.onFrame((frame) => {
  elapsed += frame.dt;
  for (const p of planets) {
    const [x, y, z] = positionAt(p, elapsed);
    app.nodes.require(p.id).setPosition(x, y, z);
  }
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
