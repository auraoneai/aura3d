import {
  camera,
  createAuraApp,
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

const COUNT = 64;
const RADIUS = 4;
const BAR_WIDTH = (2 * Math.PI * RADIUS) / COUNT * 0.7;

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function barHeight(i: number, t: number): number {
  const a = (i / COUNT) * Math.PI * 2;
  const v =
    0.5 * Math.sin(a * 3 + t * 1.7) +
    0.3 * Math.sin(a * 7 - t * 2.3) +
    0.2 * Math.sin(a * 13 + t * 3.1) +
    0.25 * Math.sin(t * 1.1);
  // v roughly within [-1.25, 1.25] -> height in [0.3, 3.3]
  return 1.8 + 1.2 * v;
}

function transformAt(i: number, t: number): AuraTransformSpec {
  const a = (i / COUNT) * Math.PI * 2;
  const h = Math.max(0.1, barHeight(i, t));
  return {
    position: [Math.cos(a) * RADIUS, h / 2, Math.sin(a) * RADIUS],
    rotation: [0, -a, 0],
    scale: [0.35, h, BAR_WIDTH]
  };
}

const transforms = Array.from({ length: COUNT }, (_, i) => transformAt(i, 0));
const colors = Array.from({ length: COUNT }, (_, i) => hslToHex(i / COUNT, 0.85, 0.55));

const app = createAuraApp("#app", {
  scene: scene({ background: "#0c0f18" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.directional({ position: [5, 10, 4], target: [0, 0, 0], intensity: 2.6, shadow: true }))
    .add(
      primitives.plane({
        name: "floor",
        size: [16, 1, 16],
        receiveShadow: true,
        material: material.pbr({ color: "#2a2f3d", roughness: 0.85 })
      })
    )
    .add(
      instances.box({
        name: "bars",
        transforms,
        colors,
        castShadow: true,
        receiveShadow: true,
        material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1 })
      }).runtime({ id: "bars", mutable: true })
    )
    .camera(camera.orbit({ position: [7, 6, 9], target: [0, 1, 0], fov: 42, autoRotate: 0.15 }))
});

let first = true;
app.onFrame((f) => {
  const bars = app.nodes.require("bars");
  bars.setInstances(
    transforms.map((_, i) => transformAt(i, f.time)),
    colors
  );
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
