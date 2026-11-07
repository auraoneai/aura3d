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
const BAR_WIDTH = 0.28;

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

const colors = Array.from({ length: COUNT }, (_, i) => hslToHex(i / COUNT, 0.75, 0.55));

function barHeight(i: number, t: number): number {
  const a = (i / COUNT) * Math.PI * 2;
  const v =
    0.5 * Math.sin(a * 3 + t * 2.1) +
    0.3 * Math.sin(a * 7 - t * 3.3) +
    0.2 * Math.sin(a * 13 + t * 4.7);
  return 0.35 + (v * 0.5 + 0.5) * 2.8;
}

function transformAt(i: number, t: number): AuraTransformSpec {
  const a = (i / COUNT) * Math.PI * 2;
  const h = barHeight(i, t);
  return {
    position: [Math.cos(a) * RADIUS, h / 2, Math.sin(a) * RADIUS],
    rotation: [0, -a, 0],
    scale: [BAR_WIDTH, h, BAR_WIDTH]
  };
}

const initial = Array.from({ length: COUNT }, (_, i) => transformAt(i, 0));

const app = createAuraApp("#app", {
  scene: scene({ background: "#12141c" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.hemisphere({ intensity: 0.5 }))
    .add(lights.directional({ position: [6, 10, 4], target: [0, 0, 0], intensity: 2.6, shadow: true }))
    .add(
      primitives.plane({
        name: "floor",
        size: [16, 1, 16],
        material: material.pbr({ color: "#5b616d", roughness: 0.85 })
      })
    )
    .add(
      instances
        .box({
          name: "bars",
          transforms: initial,
          colors,
          material: material.pbr({ color: "#ffffff", roughness: 0.4 })
        })
        .runtime({ id: "bars", mutable: true })
    )
    .camera(camera.orbit({ position: [8.5, 6.5, 8.5], target: [0, 1, 0], fov: 40, autoRotate: 0.2 }))
});

let signalled = false;
app.onFrame((f) => {
  const t = f.time;
  app.nodes.require("bars").setInstances(
    Array.from({ length: COUNT }, (_, i) => transformAt(i, t)),
    colors
  );
  if (!signalled) {
    signalled = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
