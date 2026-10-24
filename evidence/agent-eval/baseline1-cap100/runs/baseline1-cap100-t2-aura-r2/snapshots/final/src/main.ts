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

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
const SEED = 20240611;
const TREE_COUNT = 8000;
const ROCK_COUNT = 2000;
const FOREST_RADIUS = 60;
const FOG_COLOR = "#b9cfdc";

const ORBIT_RADIUS = 105;
const ORBIT_HEIGHT = 62;
const ORBIT_SECONDS_PER_TURN = 90;
const CAMERA_TARGET: [number, number, number] = [0, 2, 0];

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------
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

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// ---------------------------------------------------------------------------
// Forest generation (fixed seed, same forest on every load)
// ---------------------------------------------------------------------------
const rand = mulberry32(SEED);
const between = (lo: number, hi: number): number => lo + (hi - lo) * rand();

function randomInDisc(radius: number): [number, number] {
  const r = radius * Math.sqrt(rand());
  const a = rand() * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

const trunkTransforms: AuraTransformSpec[] = [];
const trunkColors: string[] = [];
const canopyTransforms: AuraTransformSpec[] = [];
const canopyColors: string[] = [];

const TRUNK_HEIGHT = 2.4;
const TRUNK_WIDTH = 0.5;
const CANOPY_HEIGHT = 5.4;
const CANOPY_WIDTH = 2.9;

for (let i = 0; i < TREE_COUNT; i += 1) {
  const [x, z] = randomInDisc(FOREST_RADIUS);
  const s = between(0.8, 1.4);
  const yaw = rand() * Math.PI * 2;
  const squash = between(0.85, 1.2);

  trunkTransforms.push({
    position: [x, (TRUNK_HEIGHT * s) / 2, z],
    rotation: [0, yaw, 0],
    scale: [TRUNK_WIDTH * s, TRUNK_HEIGHT * s, TRUNK_WIDTH * s]
  });
  trunkColors.push(hslToHex(between(18, 34), between(0.35, 0.5), between(0.2, 0.32)));

  const canopyBase = TRUNK_HEIGHT * s * 0.7;
  canopyTransforms.push({
    position: [x, canopyBase + (CANOPY_HEIGHT * s) / 2, z],
    rotation: [0, yaw, 0],
    scale: [CANOPY_WIDTH * s * squash, CANOPY_HEIGHT * s * between(0.9, 1.15), CANOPY_WIDTH * s * squash]
  });
  // Mostly greens, with some yellow-green and blue-green trees.
  canopyColors.push(hslToHex(between(82, 150), between(0.4, 0.62), between(0.2, 0.4)));
}

const rockTransforms: AuraTransformSpec[] = [];
const rockColors: string[] = [];
for (let i = 0; i < ROCK_COUNT; i += 1) {
  const [x, z] = randomInDisc(FOREST_RADIUS);
  const s = between(0.5, 1.6);
  const sy = s * between(0.5, 0.9);
  rockTransforms.push({
    position: [x, sy * 0.25, z],
    rotation: [between(-0.3, 0.3), rand() * Math.PI * 2, between(-0.3, 0.3)],
    scale: [s * between(0.9, 1.4), sy, s * between(0.9, 1.4)]
  });
  // Neutral greys with warm/cool drift.
  rockColors.push(hslToHex(between(20, 220), between(0.02, 0.14), between(0.32, 0.6)));
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
type MutableCamera = {
  position?: [number, number, number];
  target?: [number, number, number];
};

const cameraSpec = camera.perspective({
  position: [ORBIT_RADIUS, ORBIT_HEIGHT, 0],
  target: CAMERA_TARGET,
  fov: 45,
  near: 1,
  far: 800
});

const forest = scene()
  .background(FOG_COLOR)
  .camera(cameraSpec)
  .add(
    primitives.plane({
      name: "ground",
      size: [900, 1, 900],
      material: material.pbr({ color: "#56713f", roughness: 1, metallic: 0 }),
      castShadow: false,
      receiveShadow: true
    })
  )
  .add(
    instances.cylinder({
      name: "tree trunks",
      transforms: trunkTransforms,
      colors: trunkColors,
      material: material.pbr({ color: "#ffffff", roughness: 0.95, metallic: 0 }),
      frustumCulled: false,
      castShadow: true,
      receiveShadow: true,
      params: { radialSegments: 6 }
    })
  )
  .add(
    instances.cone({
      name: "tree canopies",
      transforms: canopyTransforms,
      colors: canopyColors,
      material: material.pbr({ color: "#ffffff", roughness: 0.85, metallic: 0 }),
      frustumCulled: false,
      castShadow: true,
      receiveShadow: true,
      params: { radius: 0.5, height: 1, radialSegments: 8 }
    })
  )
  .add(
    instances.polyhedron({
      name: "rocks",
      transforms: rockTransforms,
      colors: rockColors,
      material: material.pbr({ color: "#ffffff", roughness: 0.9, metallic: 0 }),
      frustumCulled: false,
      castShadow: true,
      receiveShadow: true,
      params: { variant: "icosahedron", radius: 0.5, detail: 1 }
    })
  )
  .add(lights.hemisphere({ name: "sky fill", skyColor: "#d6e6f5", groundColor: "#4d5a3a", intensity: 0.8 }))
  .add(
    lights.directional({
      name: "sun",
      position: [-70, 95, 55],
      target: [0, 0, 0],
      intensity: 3,
      color: "#fff1dc",
      shadow: {
        mapSize: 4096,
        cascades: 3,
        maxDistance: 220,
        bias: 0.0005,
        normalBias: 0.05
      }
    })
  )
  .add(effects.fog({ name: "forest fog", density: 0.005, color: FOG_COLOR, intensity: 0.6 }));

// ---------------------------------------------------------------------------
// App + camera orbit
// ---------------------------------------------------------------------------
const app = createAuraApp("#app", {
  scene: forest,
  pixelRatio: 1,
  resize: false
});

const startTime = performance.now();

function placeCamera(): void {
  const angle = (((performance.now() - startTime) / 1000) / ORBIT_SECONDS_PER_TURN) * Math.PI * 2;
  const position: [number, number, number] = [
    Math.cos(angle) * ORBIT_RADIUS,
    ORBIT_HEIGHT,
    Math.sin(angle) * ORBIT_RADIUS
  ];
  const live = app.scene.camera as unknown as MutableCamera;
  const authored = cameraSpec as unknown as MutableCamera;
  for (const cam of live === authored ? [live] : [live, authored]) {
    cam.position = position;
    cam.target = CAMERA_TARGET;
  }
}

app.onFrame(placeCamera);
placeCamera();

void app.ready().then(() => {
  let frames = 0;
  const waitForFrames = (): void => {
    frames += 1;
    if (frames >= 3) {
      window.__EVAL_READY__ = true;
      return;
    }
    requestAnimationFrame(waitForFrames);
  };
  requestAnimationFrame(waitForFrames);
});
