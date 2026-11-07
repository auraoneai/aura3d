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

const COUNT = 64;
const RING_RADIUS = 4;
const BAR_SIZE = 0.3;

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

const colors: string[] = Array.from({ length: COUNT }, (_, i) => hslToHex(i / COUNT, 0.85, 0.55));

function barHeight(i: number, t: number): number {
  const p = (i / COUNT) * Math.PI * 2;
  const v =
    0.5 * Math.sin(p * 3 + t * 2.1) +
    0.3 * Math.sin(p * 7 - t * 3.3) +
    0.2 * Math.sin(p * 13 + t * 4.7) +
    0.25 * Math.sin(t * 1.3 + p);
  return 0.35 + 1.35 * (v + 1.25) / 1.25 * 0.8;
}

function transformFor(i: number, t: number): AuraTransformSpec {
  const a = (i / COUNT) * Math.PI * 2;
  const h = barHeight(i, t);
  return {
    position: [Math.cos(a) * RING_RADIUS, h / 2, Math.sin(a) * RING_RADIUS],
    rotation: [0, -a, 0],
    scale: [BAR_SIZE, h, BAR_SIZE]
  };
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#12151d" })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#cfd8ff", groundColor: "#2a2630", intensity: 0.5 }))
    .add(lights.directional({ name: "key", position: [5, 9, 4], target: [0, 0, 0], intensity: 2.6, color: "#fff1e0", shadow: true }))
    .add(lights.point({ position: [0, 2.5, 0], intensity: 10, color: "#8fb4ff", distance: 10 }))
    .add(effects.fog({ color: "#12151d", density: 0.02 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [24, 1, 24],
        material: material.pbr({ color: "#5a6070", roughness: 0.85 })
      })
    )
    .add(
      instances.box({
        name: "bars",
        transforms: Array.from({ length: COUNT }, (_, i) => transformFor(i, 0)),
        colors,
        material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1 })
      }).runtime({ id: "bars", mutable: true })
    )
    .camera(camera.orbit({ position: [0, 6.5, 10.5], target: [0, 0.8, 0], fov: 42, autoRotate: 0.18 }))
});

app.onFrame((f) => {
  app.nodes.require("bars").setInstances(
    Array.from({ length: COUNT }, (_, i) => transformFor(i, f.time)),
    colors
  );
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
});
