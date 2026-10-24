import {
  camera,
  createAuraApp,
  effects,
  instances,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";
import type { AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const SEED = 20240611;
const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 48;
const ORBIT_SPEED = 0.1; // radians per second (about 63 s per revolution)

// mulberry32: small deterministic PRNG, so the forest is identical on every load.
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(SEED);
const range = (min: number, max: number): number => min + (max - min) * rng();

function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const trunkTransforms: AuraTransformSpec[] = [];
const trunkColors: string[] = [];
const canopyTransforms: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
const rockTransforms: AuraTransformSpec[] = [];
const rockColors: string[] = [];

function scatterPoint(): [number, number] {
  const radius = FOREST_RADIUS * Math.sqrt(rng());
  const angle = rng() * Math.PI * 2;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

for (let i = 0; i < TREE_COUNT; i += 1) {
  const [x, z] = scatterPoint();
  const s = range(0.65, 1.35);
  const yaw = rng() * Math.PI * 2;
  const trunkHeight = 1.7 * s;
  const canopyHeight = range(2.8, 3.8) * s;
  const canopyDiameter = range(1.5, 2.1) * s;

  trunkTransforms.push({
    position: [x, trunkHeight / 2, z],
    rotation: [0, yaw, 0],
    scale: [0.3 * s, trunkHeight, 0.3 * s]
  });
  trunkColors.push(hsl(range(20, 34), range(0.3, 0.45), range(0.18, 0.3)));

  canopyTransforms.push({
    position: [x, trunkHeight * 0.6 + canopyHeight / 2, z],
    rotation: [0, yaw, 0],
    scale: [canopyDiameter, canopyHeight, canopyDiameter]
  });
  // Mostly greens, with some yellow-green and blue-green trees.
  canopyColors.push(hsl(range(78, 150), range(0.35, 0.65), range(0.2, 0.4)));
}

for (let i = 0; i < ROCK_COUNT; i += 1) {
  const [x, z] = scatterPoint();
  const sx = range(0.5, 1.5);
  const sy = range(0.35, 0.9);
  const sz = range(0.5, 1.5);
  rockTransforms.push({
    position: [x, sy * 0.3, z],
    rotation: [range(-0.25, 0.25), rng() * Math.PI * 2, range(-0.25, 0.25)],
    scale: [sx, sy, sz]
  });
  rockColors.push(hsl(range(15, 55), range(0.04, 0.18), range(0.32, 0.62)));
}

const FOG_COLOR = "#b9cfdc";

const trunks = instances.cylinder({
  name: "tree trunks",
  material: material.pbr({ color: "#ffffff", roughness: 0.95, metallic: 0 }),
  params: { radialSegments: 8 },
  castShadow: false,
  transforms: trunkTransforms,
  colors: trunkColors
});

const canopies = instances.cone({
  name: "tree canopies",
  material: material.pbr({ color: "#ffffff", roughness: 0.85, metallic: 0 }),
  params: { radius: 0.5, height: 1, radialSegments: 10 },
  castShadow: true,
  transforms: canopyTransforms,
  colors: canopyColors
});

const rocks = instances.polyhedron({
  name: "rocks",
  material: material.pbr({ color: "#ffffff", roughness: 0.9, metallic: 0 }),
  params: { variant: "icosahedron", radius: 0.5, detail: 0 },
  castShadow: false,
  transforms: rockTransforms,
  colors: rockColors
});

const ground = primitives
  .plane({
    name: "ground",
    material: material.pbr({ color: "#5d7a45", roughness: 1, metallic: 0 }),
    castShadow: false,
    receiveShadow: true
  })
  .position(0, 0, 0)
  .scale([400, 1, 400]);

// Tiny hidden-in-the-forest node that the camera follows. Rotating it about Y
// swings the camera offset around the forest (offsetMode "target-yaw").
const pivot = primitives
  .sphere({ name: "orbit pivot", castShadow: false, receiveShadow: false })
  .position(0, 1, 0)
  .scale(0.02)
  .runtime({ id: "orbit-pivot" });

const sun = lights.directional({
  name: "sun",
  position: [45, 80, 30],
  target: [0, 0, 0],
  intensity: 2.4,
  color: "#fff2dc",
  shadow: {
    mapSize: 2048,
    cascades: 2,
    maxDistance: 220,
    normalBias: 0.05,
    filter: "pcf"
  }
});

const sky = lights.hemisphere({
  name: "sky fill",
  skyColor: "#cfe3ff",
  groundColor: "#4d5f3a",
  intensity: 0.7
});

const forest = scene()
  .background(FOG_COLOR)
  .add(ground)
  .add(trunks)
  .add(canopies)
  .add(rocks)
  .add(pivot)
  .add(sun)
  .add(sky)
  .add(effects.fog({ density: 0.006, intensity: 0.8, color: FOG_COLOR }))
  .camera(
    camera.follow({
      targetNode: "orbit-pivot",
      offset: [85, 62, 0],
      offsetMode: "target-yaw",
      fov: 50,
      near: 1,
      far: 500
    })
  );

const canvas = document.getElementById("app") as HTMLCanvasElement;

async function main(): Promise<void> {
  const app = createAuraApp(canvas, {
    scene: forest,
    autoStart: false,
    resize: false,
    pixelRatio: 1
  });
  await app.ready();

  let last = performance.now();
  let yaw = 0;
  let framesDrawn = 0;

  const tick = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    yaw = (yaw + dt * ORBIT_SPEED) % (Math.PI * 2);
    app.nodes.get("orbit-pivot")?.setRotation(0, yaw, 0);
    app.step(dt);
    framesDrawn += 1;
    if (framesDrawn === 1) window.__EVAL_READY__ = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

void main();
