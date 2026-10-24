import {
  createAuraApp,
  effects,
  environments,
  instances,
  lights,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Deterministic placement (fixed seed => identical forest on every load)
// ---------------------------------------------------------------------------
const SEED = 20240611;
const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 50;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const range = (lo: number, hi: number): number => lo + (hi - lo) * rand();

function toHex(r: number, g: number, b: number): string {
  const c = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Uniform random point inside the forest disc. */
function randomPoint(): { x: number; z: number } {
  const r = FOREST_RADIUS * Math.sqrt(rand());
  const a = rand() * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

const trunkTransforms: AuraTransformSpec[] = [];
const trunkColors: string[] = [];
const canopyTransforms: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
const rockTransforms: AuraTransformSpec[] = [];
const rockColors: string[] = [];

for (let i = 0; i < TREE_COUNT; i += 1) {
  const { x, z } = randomPoint();
  const s = range(0.55, 1.15);
  const width = range(0.85, 1.2);
  const yaw = rand() * Math.PI * 2;

  trunkTransforms.push({
    position: [x, 0.8 * s, z],
    rotation: [0, yaw, 0],
    scale: [0.26 * s, 1.6 * s, 0.26 * s]
  });
  const bark = range(0.8, 1.2);
  trunkColors.push(toHex(0.36 * bark, 0.24 * bark, 0.14 * bark));

  canopyTransforms.push({
    position: [x, 2.6 * s, z],
    rotation: [0, yaw, 0],
    scale: [2.2 * s * width, 3.2 * s, 2.2 * s * width]
  });
  // Mix of deep pine greens, fresh greens and a few yellow-ish / autumn tints.
  const kind = rand();
  const shade = range(0.75, 1.15);
  if (kind < 0.08) {
    canopyColors.push(toHex(0.62 * shade, 0.5 * shade, 0.14 * shade));
  } else if (kind < 0.4) {
    canopyColors.push(toHex(0.2 * shade, 0.5 * shade, 0.16 * shade));
  } else {
    canopyColors.push(toHex(0.1 * shade, 0.34 * shade, 0.16 * shade));
  }
}

for (let i = 0; i < ROCK_COUNT; i += 1) {
  const { x, z } = randomPoint();
  const r = range(0.25, 0.7);
  rockTransforms.push({
    position: [x, r * 0.3, z],
    rotation: [range(-0.2, 0.2), rand() * Math.PI * 2, range(-0.2, 0.2)],
    scale: [r * range(1.0, 1.5), r * range(0.6, 0.9), r * range(0.9, 1.3)]
  });
  const g = range(0.3, 0.62);
  const warm = range(-0.04, 0.05);
  rockColors.push(toHex(g + warm, g, g - warm * 0.6));
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const FOG_COLOR = "#b7cddd";
const ORBIT_RADIUS = 88;
const ORBIT_HEIGHT = 56;
const ORBIT_SPEED = 0.06; // rad/s: one revolution in ~105 s
const CAMERA_TARGET: [number, number, number] = [0, 0, 0];
const CAMERA_FOV = 50;

function orbitPosition(angle: number): [number, number, number] {
  return [Math.sin(angle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(angle) * ORBIT_RADIUS];
}

const forest = scene()
  .background(FOG_COLOR)
  .add(environments.neutral({ intensity: 0.55 }))
  .add(
    lights.directional({
      name: "sun",
      position: [-45, 70, 30],
      target: [0, 0, 0],
      intensity: 3,
      color: "#fff1dc",
      shadow: { mapSize: 4096, maxDistance: 220, filter: "pcf", bias: 0.0008, normalBias: 0.04 }
    })
  )
  .add(effects.fog({ name: "exp2 fog", mode: "exp2", density: 0.0045, color: FOG_COLOR, heightFalloff: 0 }))
  .add(
    primitives.plane({
      name: "ground",
      position: [0, 0, 0],
      size: [180, 180],
      material: { color: "#5f7d45", roughness: 0.95 },
      receiveShadow: true,
      castShadow: false
    })
  )
  .add(
    instances.cylinder({
      name: "tree trunks",
      material: { color: "#ffffff", roughness: 0.9 },
      transforms: trunkTransforms,
      colors: trunkColors,
      castShadow: true,
      receiveShadow: true
    })
  )
  .add(
    instances.cone({
      name: "tree canopies",
      material: { color: "#ffffff", roughness: 0.85 },
      params: { radius: 0.5, height: 1, radialSegments: 10 },
      transforms: canopyTransforms,
      colors: canopyColors,
      castShadow: true,
      receiveShadow: true
    })
  )
  .add(
    instances.sphere({
      name: "rocks",
      material: { color: "#ffffff", roughness: 0.95 },
      transforms: rockTransforms,
      colors: rockColors,
      castShadow: true,
      receiveShadow: true
    })
  )
  .camera({
    mode: "perspective",
    position: orbitPosition(0),
    target: CAMERA_TARGET,
    fov: CAMERA_FOV,
    near: 1,
    far: 500
  });

const canvas = document.getElementById("app");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("canvas#app not found");
}

const app = createAuraApp(canvas, {
  scene: forest,
  resize: false,
  pixelRatio: 1
});

const startTime = performance.now();
let frames = 0;

void app.ready().then(() => {
  app.onFrame(() => {
    const angle = ((performance.now() - startTime) / 1000) * ORBIT_SPEED;
    app.camera?.setPose({
      position: orbitPosition(angle),
      target: CAMERA_TARGET,
      fov: CAMERA_FOV,
      near: 1,
      far: 500
    });
    frames += 1;
    // The callback runs before the frame is presented; flag readiness on the
    // rAF after the second callback so at least one frame has been drawn.
    if (frames === 2) {
      requestAnimationFrame(() => {
        window.__EVAL_READY__ = true;
      });
    }
  });
});
