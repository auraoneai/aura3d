import { camera, createAuraApp, environments, instances, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const BAR_COUNT = 64;
const RING_RADIUS = 5;
const BAR_WIDTH = 0.38;
const BAR_DEPTH = 0.7;
const MIN_HEIGHT = 0.35;

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h * 12) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Bar height from a mix of travelling sine waves, like an audio visualizer. */
function barHeight(i: number, t: number): number {
  const phase = (i / BAR_COUNT) * Math.PI * 2;
  const w1 = Math.sin(phase * 3 + t * 2.1);
  const w2 = Math.sin(phase * 5 - t * 1.3);
  const w3 = Math.sin(phase * 8 + t * 3.4);
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
  const mix = 0.5 * w1 + 0.3 * w2 + 0.2 * w3 * pulse; // about -1..1
  return MIN_HEIGHT + (0.5 + 0.5 * mix) * 3.6;
}

const angles: number[] = [];
const colors: string[] = [];
const initial = [];
for (let i = 0; i < BAR_COUNT; i += 1) {
  const a = (i / BAR_COUNT) * Math.PI * 2;
  angles.push(a);
  colors.push(hslToHex(i / BAR_COUNT, 0.85, 0.55));
  const h = barHeight(i, 0);
  initial.push({
    position: [Math.cos(a) * RING_RADIUS, h / 2, Math.sin(a) * RING_RADIUS] as [number, number, number],
    rotation: [0, -a, 0] as [number, number, number],
    scale: [BAR_WIDTH, h, BAR_DEPTH] as [number, number, number]
  });
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#14161d" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.hemisphere({ skyColor: "#bcd0ff", groundColor: "#2a2630", intensity: 0.6 }))
    .add(lights.directional({ name: "key", position: [7, 12, 6], target: [0, 0, 0], intensity: 2.6, shadow: true }))
    .add(lights.directional({ name: "fill", position: [-8, 5, -4], target: [0, 0, 0], intensity: 0.7, color: "#9db8ff" }))
    .add(
      primitives.plane({
        name: "floor",
        size: [26, 1, 26],
        receiveShadow: true,
        material: material.pbr({ color: "#3a3d48", roughness: 0.75, metallic: 0 })
      })
    )
    .add(
      instances
        .box({
          name: "bars",
          transforms: initial,
          colors,
          castShadow: true,
          receiveShadow: true,
          material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1 })
        })
        .runtime({ id: "bars", mutable: true })
    )
    .camera(camera.orbit({ position: [0, 8, 14], target: [0, 1.4, 0], fov: 45, autoRotate: 0.18 }))
});

const matrices = new Float32Array(BAR_COUNT * 16);

function writeBars(t: number): void {
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const a = angles[i] ?? 0;
    const h = barHeight(i, t);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const o = i * 16;
    // Column-major T * Ry(-a) * S, bar base on y = 0.
    matrices[o] = c * BAR_WIDTH;
    matrices[o + 1] = 0;
    matrices[o + 2] = s * BAR_WIDTH;
    matrices[o + 3] = 0;
    matrices[o + 4] = 0;
    matrices[o + 5] = h;
    matrices[o + 6] = 0;
    matrices[o + 7] = 0;
    matrices[o + 8] = -s * BAR_DEPTH;
    matrices[o + 9] = 0;
    matrices[o + 10] = c * BAR_DEPTH;
    matrices[o + 11] = 0;
    matrices[o + 12] = c * RING_RADIUS;
    matrices[o + 13] = h / 2;
    matrices[o + 14] = s * RING_RADIUS;
    matrices[o + 15] = 1;
  }
  app.nodes.require("bars").setInstanceMatrices(matrices, BAR_COUNT);
}

let elapsed = 0;
let first = true;
app.onFrame((frame) => {
  elapsed += frame.dt;
  writeBars(elapsed);
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
