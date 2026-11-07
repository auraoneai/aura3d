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

const COUNT = 64;
const RADIUS = 4;
const BAR_DEPTH = 0.5;
const BAR_WIDTH = 0.3;

function hueToHex(hue: number): string {
  const h = ((hue % 1) + 1) % 1;
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return 0.5 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const to = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

function barHeight(i: number, t: number): number {
  const a = (i / COUNT) * Math.PI * 2;
  const wave =
    0.45 * Math.sin(a * 3 + t * 1.6) +
    0.3 * Math.sin(a * 7 - t * 2.3) +
    0.2 * Math.sin(a * 13 + t * 3.1) +
    0.15 * Math.sin(t * 1.1 + i * 0.5);
  const norm = (wave + 1.1) / 2.2; // roughly 0..1
  return 0.3 + 3.2 * Math.max(0, Math.min(1, norm));
}

function barTransform(i: number, t: number): AuraTransformSpec {
  const a = (i / COUNT) * Math.PI * 2;
  const h = barHeight(i, t);
  return {
    position: [Math.cos(a) * RADIUS, h / 2, Math.sin(a) * RADIUS],
    rotation: [0, -a, 0],
    scale: [BAR_DEPTH, h, BAR_WIDTH]
  };
}

const colors = Array.from({ length: COUNT }, (_, i) => hueToHex(i / COUNT));
const initial = Array.from({ length: COUNT }, (_, i) => barTransform(i, 0));

const app = createAuraApp("#app", {
  scene: scene({ background: "#12151d" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.hemisphere({ intensity: 0.5 }))
    .add(lights.directional({ position: [6, 10, 4], target: [0, 0, 0], intensity: 2.6, shadow: true }))
    .add(
      primitives.plane({
        name: "floor",
        size: [24, 1, 24],
        material: material.pbr({ color: "#8a909c", roughness: 0.85 })
      })
    )
    .add(
      instances
        .box({
          name: "bars",
          transforms: initial,
          colors,
          material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1 })
        })
        .runtime({ id: "bars", mutable: true })
    )
    .add(interactions.orbit({ target: [0, 1, 0], autoRotate: 0.15 }))
    .camera(camera.orbit({ position: [9, 6.5, 9], target: [0, 1, 0], fov: 40 }))
});

app.onFrame((f) => {
  const bars = app.nodes.require("bars");
  bars.setInstances(
    Array.from({ length: COUNT }, (_, i) => barTransform(i, f.time)),
    colors
  );
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
