import {
  camera,
  createAuraApp,
  effects,
  environments,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const SPIN_DEG_PER_SEC = 20;

// ---------------------------------------------------------------- materials
// Candy-red base coat (deep coloured, semi-metallic) under a glossy clear coat.
const paint = material.physical({
  color: "#a3000f",
  metallic: 0.45,
  roughness: 0.32,
  clearcoat: 1,
  clearcoatRoughness: 0.03
});
// Black glass: very glossy, dark.
const glass = material.physical({
  color: "#04060a",
  metallic: 0.1,
  roughness: 0.04,
  clearcoat: 1,
  clearcoatRoughness: 0.02
});
const chrome = material.physical({ color: "#f4f6fa", metallic: 1, roughness: 0.04 });
const tire = material.pbr({ color: "#0b0b0d", roughness: 0.85, metallic: 0 });
const hubDark = material.pbr({ color: "#15161a", roughness: 0.4, metallic: 0.6 });
// Metallic flake: white-ish instance colours multiply this base.
const flakeBase = material.physical({ color: "#ffffff", metallic: 1, roughness: 0.18 });
// Platform top: dark, glossy, partly see-through so the mirrored car shows faintly.
const platformTop = material.physical({
  color: "#07090d",
  metallic: 0.2,
  roughness: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  opacity: 0.8
});
const ringLight = material.emissive({ color: "#bfe4ff", emissive: "#6cc4ff", emissiveIntensity: 1.6 });
const floorMat = material.pbr({ color: "#050609", roughness: 0.6, metallic: 0 });

// ---------------------------------------------------------------- geometry
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const flakeColors = ["#ff8f80", "#ffc7a8", "#ff5f55", "#ffd9c4", "#ff7a6a"];

/** Tiny metallic flakes scattered on the outside of an ellipsoid (centre c, full size s). */
function flakesOn(c: V3, s: V3, count: number, minNy: number): { transforms: AuraTransformSpec[]; colors: string[] } {
  const transforms: AuraTransformSpec[] = [];
  const colors: string[] = [];
  while (transforms.length < count) {
    const u = rand() * 2 - 1;
    if (u < minNy) continue;
    const phi = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const nx = r * Math.cos(phi);
    const nz = r * Math.sin(phi);
    const d = 0.02 + rand() * 0.018;
    transforms.push({
      position: [c[0] + (s[0] / 2) * nx, c[1] + (s[1] / 2) * u, c[2] + (s[2] / 2) * nz],
      scale: [d, d, d]
    });
    colors.push(flakeColors[Math.floor(rand() * flakeColors.length)] ?? "#ff8f80");
  }
  return { transforms, colors };
}

const BODY_C: V3 = [0, 0.85, 0];
const BODY_S: V3 = [4.0, 1.15, 1.9];
const ROOF_C: V3 = [-0.2, 1.56, 0];
const ROOF_S: V3 = [1.5, 0.42, 1.3];

/** The car, built once upright (flip = false) and once mirrored below the platform (flip = true). */
function buildCar(flip: boolean): ReturnType<typeof group> {
  const sfx = flip ? "-mirror" : "";
  const y = (v: number): number => (flip ? -v : v);
  const shadow = !flip;

  const ell = (name: string, size: V3, pos: V3, mat: ReturnType<typeof material.pbr>) =>
    primitives
      .sphere({ name: name + sfx, size, material: mat, castShadow: shadow, receiveShadow: shadow })
      .position(pos[0], y(pos[1]), pos[2]);

  const disc = (name: string, size: V3, pos: V3, mat: ReturnType<typeof material.pbr>) =>
    primitives
      .cylinder({ name: name + sfx, size, material: mat, castShadow: shadow, receiveShadow: shadow })
      .position(pos[0], y(pos[1]), pos[2])
      .rotate(Math.PI / 2, 0, 0);

  const parts = [
    // streamlined candy-red body and separate cabin bump
    ell("body", BODY_S, BODY_C, paint),
    ell("cabin-glass", [1.95, 0.85, 1.55], [-0.2, 1.3, 0], glass),
    ell("roof", ROOF_S, ROOF_C, paint),
    // chrome trim: belt-line strip, window base ring, front and rear bumper bars
    ell("belt-chrome", [4.1, 0.07, 1.99], [0, 0.86, 0], chrome),
    ell("window-chrome", [2.0, 0.05, 1.6], [-0.2, 1.1, 0], chrome),
    ell("bumper-front", [0.14, 0.2, 1.1], [1.93, 0.62, 0], chrome),
    ell("bumper-rear", [0.14, 0.2, 1.1], [-1.93, 0.62, 0], chrome)
  ];

  for (const wx of [-1.3, 1.3]) {
    for (const wz of [-1, 1]) {
      const tag = `${wx < 0 ? "r" : "f"}${wz < 0 ? "l" : "r"}`;
      parts.push(disc(`tire-${tag}`, [0.82, 0.36, 0.82], [wx, 0.41, wz * 0.86], tire));
      parts.push(disc(`rim-${tag}`, [0.58, 0.04, 0.58], [wx, 0.41, wz * 1.04], chrome));
      parts.push(disc(`cap-${tag}`, [0.22, 0.06, 0.22], [wx, 0.41, wz * 1.06], hubDark));
    }
  }

  if (!flip) {
    const b = flakesOn(BODY_C, BODY_S, 900, -0.15);
    parts.push(
      instances.sphere({ name: "flakes-body", transforms: b.transforms, colors: b.colors, material: flakeBase, castShadow: false })
    );
    const r = flakesOn(ROOF_C, ROOF_S, 220, 0.1);
    parts.push(
      instances.sphere({ name: "flakes-roof", transforms: r.transforms, colors: r.colors, material: flakeBase, castShadow: false })
    );
  }

  return group("car" + sfx, parts);
}

// Rim tick marks on the platform so the rotation reads clearly.
const ticks: AuraTransformSpec[] = [];
for (let i = 0; i < 48; i += 1) {
  const a = (i / 48) * Math.PI * 2;
  const big = i % 4 === 0;
  ticks.push({
    position: [Math.cos(a) * 3.12, 0.006, Math.sin(a) * 3.12],
    rotation: [0, -a, 0],
    scale: [big ? 0.3 : 0.14, 0.012, 0.035]
  });
}

// ---------------------------------------------------------------- scene
const turntable = group("turntable", [
  // glowing ring light around the platform edge
  primitives
    .cylinder({ name: "ring-light", size: [7.2, 0.2, 7.2], material: ringLight, castShadow: false })
    .position(0, -0.12, 0),
  primitives
    .cylinder({ name: "platform-top", size: [6.7, 0.2, 6.7], material: platformTop, castShadow: false })
    .position(0, -0.1, 0),
  instances.box({
    name: "platform-ticks",
    transforms: ticks,
    material: material.pbr({ color: "#d9dde4", metallic: 0.9, roughness: 0.25 }),
    castShadow: false
  }),
  buildCar(false),
  buildCar(true)
]).runtime({ id: "turntable", mutable: true });

const stage = scene({ background: "#030408" })
  .add(environments.metalStudio({ intensity: 0.5, background: false }))
  // key with soft shadow, faint cool rim, low cool fill
  .add(lights.directional({ name: "key", position: [3, 7, 4], target: [0, 0.6, 0], intensity: 1.1, color: "#fff2e2", shadow: true }))
  .add(lights.directional({ name: "rim", position: [-4, 3.2, -6], target: [0, 0.8, 0], intensity: 1.7, color: "#6fa6ff" }))
  .add(lights.directional({ name: "fill", position: [6, 1.5, -3], target: [0, 0.8, 0], intensity: 0.5, color: "#7a9dff" }))
  // long strip soft-boxes: two overhead, two at the sides
  .add(lights.softbox({ name: "strip-top-a", position: [0, 5.2, -1.7], target: [0, 0.8, 0], intensity: 9, color: "#ffffff", width: 8, height: 0.5 }))
  .add(lights.softbox({ name: "strip-top-b", position: [0, 5.2, 1.9], target: [0, 0.8, 0], intensity: 7, color: "#fff4e6", width: 8, height: 0.5 }))
  .add(lights.softbox({ name: "strip-left", position: [-5.5, 2.8, 1.5], target: [0, 0.8, 0], intensity: 7, color: "#ffffff", width: 0.6, height: 5 }))
  .add(lights.softbox({ name: "strip-right", position: [5.5, 2.8, -1.5], target: [0, 0.8, 0], intensity: 7, color: "#e8f0ff", width: 0.6, height: 5 }))
  .add(primitives.cylinder({ name: "showroom-floor", size: [40, 0.1, 40], material: floorMat, castShadow: false, receiveShadow: false }).position(0, -2.6, 0))
  .add(turntable)
  .add(effects.bloom({ intensity: 0.45, threshold: 0.85, radius: 0.5 }))
  .camera(camera.perspective({ position: [5.0, 1.4, 6.8], target: [0, 0.7, 0], fov: 36, near: 0.1, far: 100 }));

async function main(): Promise<void> {
  const app = createAuraApp("#app", { scene: stage });
  const t0 = performance.now();

  const update = (): void => {
    const deg = ((performance.now() - t0) / 1000) * SPIN_DEG_PER_SEC;
    app.nodes.require("turntable").setRotation(0, (deg * Math.PI) / 180, 0);
    window.__TASK_STATE__ = { turntableAngleDeg: deg, paintFinish: "clearcoat" };
  };

  window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };
  app.onFrame(update);
  await app.ready();

  const loop = (): void => {
    update();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  window.__EVAL_READY__ = true;
}

void main();
