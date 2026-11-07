import {
  camera,
  createAuraApp,
  instances,
  looks,
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
const RADIUS = 5;
const BAR_WIDTH = 0.38;

function hueToHex(h: number): string {
  // HSL with s = 0.85, l = 0.55 -> "#rrggbb" (hsl() strings are not parsed by the engine).
  const s = 0.85;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 1) * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function barHeight(i: number, t: number): number {
  const a = (i / COUNT) * Math.PI * 2;
  const v =
    0.45 * Math.sin(a * 3 + t * 1.6) +
    0.3 * Math.sin(a * 7 - t * 2.3) +
    0.2 * Math.sin(a * 13 + t * 3.1) +
    0.25 * Math.sin(t * 1.1 + a * 2);
  // v is within about [-1.2, 1.2]; map to [0.4, 3.6]
  return 2 + (v / 1.2) * 1.6;
}

function barTransform(i: number, t: number): AuraTransformSpec {
  const a = (i / COUNT) * Math.PI * 2;
  const h = barHeight(i, t);
  return {
    position: [Math.cos(a) * RADIUS, h / 2, Math.sin(a) * RADIUS],
    rotation: [0, -a, 0],
    scale: [BAR_WIDTH, h, BAR_WIDTH]
  };
}

const bars: AuraTransformSpec[] = Array.from({ length: COUNT }, (_, i) => barTransform(i, 0));
const colors: string[] = Array.from({ length: COUNT }, (_, i) => hueToHex(i / COUNT));

const CAM_RADIUS = 15;
const CAM_HEIGHT = 8;
const CAM_TARGET: [number, number, number] = [0, 1, 0];
const camPos = (t: number): [number, number, number] => {
  const a = t * 0.12;
  return [Math.cos(a) * CAM_RADIUS, CAM_HEIGHT, Math.sin(a) * CAM_RADIUS];
};

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio", { exposureEv: -0.8 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [40, 1, 40],
        material: material.pbr({ color: "#8d929c", roughness: 0.85 }),
        receiveShadow: true,
        castShadow: false
      })
    )
    .add(
      instances
        .box({
          name: "bars",
          transforms: bars,
          colors,
          material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1 }),
          castShadow: true,
          receiveShadow: true
        })
        .runtime({ id: "bars", mutable: true })
    )
    .camera(camera.perspective({ position: camPos(0), target: CAM_TARGET, fov: 40 })),
  ...looks.appOptions("product-studio")
});

let first = true;
app.onFrame((f) => {
  const t = f.time;
  for (let i = 0; i < COUNT; i += 1) bars[i] = barTransform(i, t);
  app.nodes.require("bars").setInstances(bars, colors);
  app.camera?.setPose({ position: camPos(t), target: CAM_TARGET });
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
