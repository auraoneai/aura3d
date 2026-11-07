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
const BAR_W = 0.28;
const MAX_H = 3;

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

const colors: string[] = Array.from({ length: COUNT }, (_, i) => hslToHex(i / COUNT, 0.85, 0.55));

function barHeight(i: number, t: number): number {
  const p = (i / COUNT) * Math.PI * 2;
  const v =
    0.45 * Math.sin(p * 3 + t * 2.1) +
    0.3 * Math.sin(p * 7 - t * 3.3) +
    0.2 * Math.sin(p * 13 + t * 4.7) +
    0.15 * Math.sin(t * 1.3 + i * 0.2);
  const n = (v / 1.1) * 0.5 + 0.5;
  return 0.15 + MAX_H * Math.max(0, Math.min(1, n));
}

function barTransform(i: number, t: number): AuraTransformSpec {
  const a = (i / COUNT) * Math.PI * 2;
  const h = barHeight(i, t);
  return {
    position: [Math.cos(a) * RADIUS, h / 2, Math.sin(a) * RADIUS],
    rotation: [0, -a, 0],
    scale: [BAR_W, h, BAR_W * 1.3]
  };
}

const initial = Array.from({ length: COUNT }, (_, i) => barTransform(i, 0));

const CAM_R = 11;
const CAM_Y = 6;
const camPos = (t: number): [number, number, number] => {
  const a = t * 0.15;
  return [Math.cos(a) * CAM_R, CAM_Y, Math.sin(a) * CAM_R];
};

const app = createAuraApp("#app", {
  scene: scene({ background: "#10131c" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.hemisphere({ skyColor: "#b8c8ff", groundColor: "#2a2230", intensity: 0.6 }))
    .add(
      lights.directional({
        name: "key",
        position: [6, 12, 5],
        target: [0, 0, 0],
        intensity: 2.6,
        color: "#fff1dc",
        shadow: true
      })
    )
    .add(
      primitives.plane({
        name: "floor",
        size: [24, 1, 24],
        material: material.pbr({ color: "#7d8394", roughness: 0.85 }),
        receiveShadow: true
      })
    )
    .add(
      instances.box({
        name: "bars",
        transforms: initial,
        colors,
        material: material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1 }),
        castShadow: true,
        receiveShadow: true
      }).runtime({ id: "bars", mutable: true })
    )
    .camera(camera.perspective({ position: camPos(0), target: [0, 1.2, 0], fov: 45 }))
});

app.onFrame((f) => {
  const t = f.time;
  const transforms = new Array<AuraTransformSpec>(COUNT);
  for (let i = 0; i < COUNT; i += 1) transforms[i] = barTransform(i, t);
  app.nodes.require("bars").setInstances(transforms, colors);
  app.camera?.setPose({ position: camPos(t), target: [0, 1.2, 0] }, { cut: true });
});

await app.ready();
window.__EVAL_READY__ = true;
