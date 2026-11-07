import {
  camera,
  createAuraApp,
  effects,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

interface PlanetDef {
  id: string;
  radius: number; // orbit radius
  size: number; // diameter
  speed: number; // rad/s
  phase: number;
  color: string;
  roughness: number;
}

const PLANETS: PlanetDef[] = [
  { id: "mercury", radius: 2.4, size: 0.5, speed: 1.6, phase: 0.5, color: "#b8b0a6", roughness: 0.8 },
  { id: "venus", radius: 3.8, size: 0.9, speed: 1.1, phase: 2.4, color: "#e8b66a", roughness: 0.6 },
  { id: "earth", radius: 5.4, size: 1.1, speed: 0.78, phase: 4.1, color: "#3f7fd8", roughness: 0.5 },
  { id: "saturn", radius: 7.2, size: 1.6, speed: 0.5, phase: 1.3, color: "#d9b97e", roughness: 0.55 },
  { id: "neptune", radius: 9.0, size: 1.2, speed: 0.34, phase: 5.3, color: "#7b5fd6", roughness: 0.5 }
];
const RINGED = "saturn";
const RING_TILT = 1.25; // radians about X (1.57 = flat)

const orbitPos = (p: PlanetDef, t: number): [number, number, number] => [
  Math.cos(p.phase + t * p.speed) * p.radius,
  0,
  Math.sin(p.phase + t * p.speed) * p.radius
];

// Orbit guide rings: thin flat tori centred on the star.
const orbitGuides = PLANETS.map((p) =>
  primitives
    .torus({
      name: `orbit-${p.id}`,
      size: p.radius * 2 / 0.86,
      params: { tube: 0.003, radialSegments: 128, tubularSegments: 6 },
      material: material.emissive({ color: "#5b6a92", emissive: "#5b6a92", emissiveIntensity: 0.35, roughness: 1 }),
      rotation: [Math.PI / 2, 0, 0]
    })
);

// Deterministic background stars.
const STAR_COUNT = 140;
let seed = 12345;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const starTransforms: AuraTransformSpec[] = Array.from({ length: STAR_COUNT }, () => {
  const a = rnd() * Math.PI * 2;
  const el = (rnd() - 0.5) * 1.2;
  const r = 40 + rnd() * 10;
  const s = 0.08 + rnd() * 0.14;
  return {
    position: [Math.cos(a) * r, -6 + rnd() * 30 - 2 + el, Math.sin(a) * r - 10] as [number, number, number],
    scale: [s, s, s] as [number, number, number]
  };
});

let stage = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.12, background: false }))
  .add(lights.point({ position: [0, 0, 0], intensity: 900, color: "#fff1d0" }))
  .add(
    primitives
      .sphere({
        name: "star",
        size: 2.6,
        material: material.emissive({ color: "#ffb347", emissive: "#ffb347", emissiveIntensity: 5, roughness: 0.5 })
      })
      .runtime({ id: "star", mutable: true })
  )
  .add(
    instances.sphere({
      name: "backdrop-stars",
      transforms: starTransforms,
      material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2, roughness: 1 })
    })
  )
  .add(effects.bloom({ intensity: 0.9, threshold: 0.7, radius: 0.7 }));

for (const g of orbitGuides) stage = stage.add(g);

for (const p of PLANETS) {
  const [x, y, z] = orbitPos(p, 0);
  stage = stage.add(
    primitives
      .sphere({
        name: p.id,
        size: p.size,
        material: material.pbr({ color: p.color, roughness: p.roughness, metalness: 0.05 })
      })
      .position(x, y, z)
      .runtime({ id: p.id, mutable: true })
  );
  if (p.id === RINGED) {
    const d = p.size * 2.3;
    stage = stage.add(
      primitives
        .torus({
          name: "planet-ring",
          size: [d / 0.86, d / 0.86, 0.5],
          params: { tube: 0.12, radialSegments: 96, tubularSegments: 8 },
          material: material.pbr({ color: "#e6d3a3", roughness: 0.6 }),
          rotation: [RING_TILT, 0, 0]
        })
        .position(x, y, z)
        .runtime({ id: "planet-ring", mutable: true })
    );
  }
}

stage = stage.camera(camera.perspective({ position: [0, 14, 17], target: [0, -0.5, 0], fov: 40 }));

const app = createAuraApp("#app", { scene: stage });

app.onFrame((f) => {
  for (const p of PLANETS) {
    const [x, y, z] = orbitPos(p, f.time);
    app.nodes.require(p.id).setPosition(x, y, z);
    if (p.id === RINGED) app.nodes.require("planet-ring").setPosition(x, y, z);
  }
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
