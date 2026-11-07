import {
  camera,
  createAuraApp,
  environments,
  instances,
  interactions,
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

const BAR_COUNT = 64;
const RING_RADIUS = 5;
const BAR_WIDTH = 0.4; // tangent direction
const BAR_DEPTH = 0.4; // radial direction

/** Bar height from a mix of sine waves, always > 0. */
function barHeight(i: number, t: number): number {
  const phase = (i / BAR_COUNT) * Math.PI * 2;
  const wave =
    0.45 * Math.sin(t * 1.6 + phase * 3) +
    0.3 * Math.sin(t * 2.7 - phase * 5 + 1.3) +
    0.2 * Math.sin(t * 0.9 + phase * 2 + 0.5) +
    0.1 * Math.sin(t * 4.1 + phase * 11);
  // wave range is about [-1.05, 1.05]
  return 0.25 + 1.6 * (0.5 + 0.5 * (wave / 1.05));
}

/** Writes one column-major T*R*S matrix per bar into `out`. */
function fillMatrices(out: Float32Array, t: number): void {
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const a = (i / BAR_COUNT) * Math.PI * 2;
    const h = barHeight(i, t);
    // Rotation about Y that maps local +x onto the ring tangent.
    const c = -Math.sin(a);
    const s = -Math.cos(a);
    const o = i * 16;
    out[o] = c * BAR_WIDTH;
    out[o + 1] = 0;
    out[o + 2] = -s * BAR_WIDTH;
    out[o + 3] = 0;
    out[o + 4] = 0;
    out[o + 5] = h;
    out[o + 6] = 0;
    out[o + 7] = 0;
    out[o + 8] = s * BAR_DEPTH;
    out[o + 9] = 0;
    out[o + 10] = c * BAR_DEPTH;
    out[o + 11] = 0;
    out[o + 12] = Math.cos(a) * RING_RADIUS;
    out[o + 13] = h / 2; // unit box is centred, so lift by half the height to stand on the floor
    out[o + 14] = Math.sin(a) * RING_RADIUS;
    out[o + 15] = 1;
  }
}

const matrices = new Float32Array(BAR_COUNT * 16);
fillMatrices(matrices, 0);

const initial: AuraTransformSpec[] = [];
const colors: string[] = [];
for (let i = 0; i < BAR_COUNT; i += 1) {
  const a = (i / BAR_COUNT) * Math.PI * 2;
  initial.push({
    position: [Math.cos(a) * RING_RADIUS, 0.5, Math.sin(a) * RING_RADIUS],
    rotation: [0, -a - Math.PI / 2, 0],
    scale: [BAR_WIDTH, 1, BAR_DEPTH]
  });
  colors.push(`hsl(${Math.round((i / BAR_COUNT) * 360)}, 85%, 55%)`);
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#0d1117" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.hemisphere({ skyColor: "#c8d8ff", groundColor: "#2a2f3a", intensity: 0.5 }))
    .add(
      lights.directional({
        name: "key",
        position: [7, 12, 5],
        target: [0, 0, 0],
        intensity: 2.6,
        color: "#fff3e0",
        shadow: { filter: "pcf", softness: 2.5, mapSize: 2048 }
      })
    )
    .add(lights.directional({ name: "fill", position: [-6, 4, -5], target: [0, 0, 0], intensity: 0.8, color: "#9db8ff" }))
    .add(
      primitives.plane({
        name: "floor",
        size: [40, 1, 40],
        material: material.pbr({ color: "#3a4150", roughness: 0.85 }),
        receiveShadow: true,
        castShadow: false
      })
    )
    .add(
      instances
        .box({
          name: "bars",
          transforms: initial,
          colors,
          material: material.pbr({ color: "#ffffff", roughness: 0.35, metallic: 0.1 }),
          castShadow: true,
          receiveShadow: true
        })
        .runtime({ id: "bars", mutable: true })
    )
    .add(interactions.orbit({ target: [0, 1, 0], autoRotate: 0.15 }))
    .camera(camera.orbit({ position: [10, 6.5, 10], target: [0, 1, 0], fov: 42 }))
});

const start = performance.now();
let readySignalled = false;
app.onFrame(() => {
  const t = (performance.now() - start) / 1000;
  fillMatrices(matrices, t);
  app.nodes.require("bars").setInstanceMatrices(matrices, BAR_COUNT);
  if (!readySignalled) {
    readySignalled = true;
    // Wait for the frame that includes this update to be presented.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    }));
  }
});

await app.ready();
