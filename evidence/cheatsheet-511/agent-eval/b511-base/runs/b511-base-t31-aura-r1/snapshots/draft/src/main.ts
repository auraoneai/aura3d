import { camera, createAuraApp, effects, environments, geometry, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Flat annulus in the XZ plane with both faces, used for the planet ring and the orbit guides.
function annulus(inner: number, outer: number, segments: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      positions.push(c * inner, 0, s * inner, c * outer, 0, s * outer);
      normals.push(0, side, 0, 0, side, 0);
    }
    for (let i = 0; i < segments; i += 1) {
      const i0 = base + i * 2; // inner i
      const o0 = i0 + 1; // outer i
      const i1 = i0 + 2; // inner i+1
      const o1 = i0 + 3; // outer i+1
      if (side === 1) indices.push(i0, i1, o0, i1, o1, o0);
      else indices.push(i0, o0, i1, i1, o0, o1);
    }
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices,
    bounds: { min: [-outer, 0, -outer], max: [outer, 0, outer] }
  });
}

interface PlanetSpec {
  id: string;
  radius: number; // orbit radius
  size: number; // diameter
  speed: number; // rad/s
  phase: number;
  color: string;
  roughness: number;
  ring?: boolean;
}

const planets: PlanetSpec[] = [
  { id: "mercury", radius: 3.0, size: 0.55, speed: 0.95, phase: 0.4, color: "#b8a99a", roughness: 0.9 },
  { id: "venus", radius: 4.6, size: 0.9, speed: 0.62, phase: 2.2, color: "#e8a24a", roughness: 0.7 },
  { id: "terra", radius: 6.1, size: 1.0, speed: 0.42, phase: 4.1, color: "#3f7fe0", roughness: 0.5 },
  { id: "saturn", radius: 7.7, size: 1.3, speed: 0.28, phase: 5.5, color: "#d8c28a", roughness: 0.6, ring: true },
  { id: "mars", radius: 9.2, size: 0.75, speed: 0.2, phase: 1.3, color: "#d4513a", roughness: 0.8 }
];

const orbitPos = (p: PlanetSpec, t: number): [number, number, number] => {
  const a = p.phase + p.speed * t;
  return [Math.cos(a) * p.radius, 0, Math.sin(a) * p.radius];
};

const stage = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.point({ name: "star-light", position: [0, 0, 0], intensity: 110, color: "#ffe2b0", distance: 60, decay: 2, shadow: false }))
  .add(
    primitives
      .sphere({
        name: "star",
        size: 2.2,
        material: material.emissive({ color: "#ffd27a", emissive: "#ffb347", emissiveIntensity: 3.2 }),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0, 0)
  )
  .add(effects.bloom({ intensity: 1.1, threshold: 0.7, radius: 0.65 }))
  .camera(camera.perspective({ position: [0, 13, 16], target: [0, 0, 0.5], fov: 45, near: 0.1, far: 120 }));

const guideMaterial = material.pbr({ color: "#4a5570", roughness: 0.9 });
const ringMaterial = material.pbr({ color: "#cdb98a", roughness: 0.7 });

for (const p of planets) {
  stage.add(
    geometry.custom(annulus(p.radius - 0.02, p.radius + 0.02, 160), {
      name: `orbit-${p.id}`,
      material: guideMaterial,
      castShadow: false,
      receiveShadow: false
    })
  );

  const body = primitives.sphere({
    name: `${p.id}-body`,
    size: p.size,
    material: material.pbr({ color: p.color, roughness: p.roughness, metallic: 0 })
  });
  const children = [body];
  if (p.ring) {
    children.push(
      geometry
        .custom(annulus(p.size * 0.78, p.size * 1.35, 96), {
          name: `${p.id}-ring`,
          material: ringMaterial,
          castShadow: false,
          receiveShadow: false
        })
        .rotate(0.45, 0, 0.25)
    );
  }
  stage.add(group(p.id, children, { position: orbitPos(p, 0) }).runtime({ id: p.id, mutable: true }));
}

const app = createAuraApp("#app", { scene: stage });

const start = performance.now();
app.onFrame(() => {
  const t = (performance.now() - start) / 1000;
  for (const p of planets) {
    const [x, y, z] = orbitPos(p, t);
    app.nodes.require(p.id).setPosition(x, y, z);
  }
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
