import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

interface Planet {
  id: string;
  radius: number;
  size: number;
  speed: number;
  phase: number;
  color: string;
  tilt?: number;
}

const planets: Planet[] = [
  { id: "p0", radius: 2.6, size: 0.4, speed: 1.6, phase: 0.3, color: "#b9b3a8" },
  { id: "p1", radius: 4.0, size: 0.65, speed: 1.1, phase: 2.1, color: "#e0a24a" },
  { id: "p2", radius: 5.6, size: 0.8, speed: 0.75, phase: 4.0, color: "#3f86e0" },
  { id: "p3", radius: 7.4, size: 1.05, speed: 0.5, phase: 5.4, color: "#d9884f" },
  { id: "p4", radius: 9.2, size: 0.6, speed: 0.33, phase: 1.2, color: "#6fd3c0" }
];
const RINGED = "p3";

const pos = (p: Planet, t: number): [number, number, number] => {
  const a = p.phase + t * p.speed;
  return [Math.cos(a) * p.radius, 0, Math.sin(a) * p.radius];
};

let s = scene({ background: "#03040a" })
  .add(environments.neutral({ intensity: 0.15, background: false }))
  .add(lights.point({ position: [0, 0, 0], intensity: 400, color: "#fff1cf", distance: 40 }))
  .add(
    primitives
      .sphere({
        name: "star",
        size: 1.8,
        material: material.emissive({ color: "#ffb347", emissive: "#ffb347", emissiveIntensity: 3 }),
        castShadow: false
      })
      .runtime({ id: "star", mutable: true })
  )
  .add(effects.bloom({ intensity: 0.9, threshold: 0.6, radius: 0.7 }));

for (const p of planets) {
  const [x, y, z] = pos(p, 0);
  s = s.add(
    primitives
      .sphere({ name: p.id, size: p.size * 2, material: material.pbr({ color: p.color, roughness: 0.7 }) })
      .position(x, y, z)
      .runtime({ id: p.id, mutable: true })
  );
  if (p.id === RINGED) {
    s = s.add(
      primitives
        .torus({
          name: "ring",
          size: [p.size * 4.4, p.size * 4.4, p.size * 1.0],
          material: material.pbr({ color: "#e8d9b0", roughness: 0.5 })
        })
        .position(x, y, z)
        .rotate(Math.PI / 2 + 0.3, 0, 0.25)
        .runtime({ id: "ring", mutable: true })
    );
  }
}

const app = createAuraApp("#app", {
  scene: s.camera(camera.perspective({ position: [0, 17, 16], target: [0, 0, 0], fov: 45 }))
});

let flagged = false;
app.onFrame((f) => {
  for (const p of planets) {
    const [x, y, z] = pos(p, f.time);
    app.nodes.require(p.id).setPosition(x, y, z).setRotation(0, f.time * 0.8, 0);
    if (p.id === RINGED) app.nodes.require("ring").setPosition(x, y, z);
  }
  app.nodes.require("star").setRotation(0, f.time * 0.2, 0);
  if (!flagged) {
    flagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
