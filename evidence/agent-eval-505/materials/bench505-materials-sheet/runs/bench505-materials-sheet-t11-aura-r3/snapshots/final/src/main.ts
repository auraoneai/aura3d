import {
  camera,
  createAuraApp,
  effects,
  environments,
  group,
  lights,
  material,
  primitives,
  scene,
  texture
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

type Kids = NonNullable<Parameters<typeof group>[1]>;

// ---- Metallic flake: a fine random micro-normal map for the base coat only ----
let seed = 90210;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const FN = 256;
const flakeData = new Uint8Array(FN * FN * 4);
for (let i = 0; i < FN * FN; i += 1) {
  const nx = (rand() * 2 - 1) * 0.75;
  const ny = (rand() * 2 - 1) * 0.75;
  const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
  flakeData[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
  flakeData[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
  flakeData[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  flakeData[i * 4 + 3] = 255;
}
const flake = texture.data({ width: FN, height: FN, data: flakeData, format: "rgba8", colorSpace: "linear" });
flake.wrapS = "repeat";
flake.wrapT = "repeat";
flake.repeat = [10, 10];
flake.needsUpdate = true;

// ---- Materials ----
const paint = material.carPaint({
  name: "candy red paint",
  color: "#b4001d",
  roughness: 0.3,
  metallic: 0.6,
  clearcoat: 1,
  clearcoatRoughness: 0.015,
  envMapIntensity: 1.8,
  normal: flake,
  normalScale: 0.55
});
const glass = material.clearcoat({
  name: "black glass",
  color: "#020305",
  roughness: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 2
});
const chrome = material.chrome({ name: "chrome trim" });
const rubber = material.rubber({ name: "rubber", color: "#08090b", roughness: 0.8 });
const mirrorPaint = material.pbr({ name: "mirror paint", color: "#2a0008", roughness: 0.35, doubleSided: true });
const mirrorDark = material.pbr({ name: "mirror dark", color: "#030406", roughness: 0.4, doubleSided: true });
const mirrorChrome = material.pbr({ name: "mirror chrome", color: "#59606b", roughness: 0.3, doubleSided: true });

// ---- The object ----
const buildCar = (tag: string, mirror: boolean): Kids => {
  const P = mirror ? mirrorPaint : paint;
  const G = mirror ? mirrorDark : glass;
  const C = mirror ? mirrorChrome : chrome;
  const R = mirror ? mirrorDark : rubber;
  const cast = !mirror;
  const kids: Kids[number][] = [];
  // streamlined body: capsule laid along X
  kids.push(primitives.capsule({ name: `body-${tag}`, size: [0.9, 3.8, 1.6], material: P, position: [0, 0.62, 0], rotation: [0, 0, Math.PI / 2], castShadow: cast }));
  // black glass greenhouse and painted roof bump
  kids.push(primitives.sphere({ name: `glass-${tag}`, size: [1.8, 0.82, 1.28], material: G, position: [-0.15, 1.1, 0], castShadow: cast }));
  kids.push(primitives.sphere({ name: `roof-${tag}`, size: [1.5, 0.62, 1.16], material: P, position: [-0.2, 1.3, 0], castShadow: cast }));
  // chrome side strips and bumper bars
  for (const s of [-1, 1]) {
    kids.push(primitives.capsule({ name: `trim-${tag}-${s}`, size: [0.05, 1.7, 0.05], material: C, position: [0, 0.6, s * 0.77], rotation: [0, 0, Math.PI / 2], castShadow: false }));
  }
  for (const s of [-1, 1]) {
    kids.push(primitives.capsule({ name: `bumper-${tag}-${s}`, size: [0.08, 0.9, 0.08], material: C, position: [s * 1.82, 0.42, 0], rotation: [Math.PI / 2, 0, 0], castShadow: false }));
  }
  // wheels: rubber discs with chrome hubs
  for (const wx of [-1.15, 1.15]) {
    for (const wz of [-1, 1]) {
      kids.push(primitives.cylinder({ name: `wheel-${tag}-${wx}-${wz}`, size: [0.72, 0.28, 0.72], material: R, position: [wx, 0.36, wz * 0.76], rotation: [Math.PI / 2, 0, 0], castShadow: cast, params: { radialSegments: 32 } }));
      kids.push(primitives.cylinder({ name: `hub-${tag}-${wx}-${wz}`, size: [0.38, 0.3, 0.38], material: C, position: [wx, 0.36, wz * 0.77], rotation: [Math.PI / 2, 0, 0], castShadow: false, params: { radialSegments: 24 } }));
    }
  }
  return kids;
};

// ---- Turntable (rotating part): glossy dark platform, mirrored object, marks ----
const platformMat = material.reflectiveFloor({ name: "platform", color: "#05070c", opacity: 0.8, roughness: 0.1 });
const tickMat = material.chrome({ name: "platform tick" });
const turntableKids: Kids[number][] = [
  primitives.cylinder({ name: "platform", size: [6.7, 0.04, 6.7], material: platformMat, position: [0, -0.02, 0], castShadow: false, params: { radialSegments: 96 } }),
  group("car", buildCar("car", false), { position: [0, 0, 0] }),
  group("car-reflection", buildCar("mir", true), { position: [0, 0, 0], scale: [1, -1, 1] })
];
for (let i = 0; i < 24; i += 1) {
  const a = (i / 24) * Math.PI * 2;
  turntableKids.push(
    primitives.box({ name: `tick-${i}`, size: [0.05, 0.012, i % 6 === 0 ? 0.3 : 0.14], material: tickMat, position: [Math.cos(a) * 3.1, 0.006, Math.sin(a) * 3.1], rotation: [0, -a, 0], castShadow: false })
  );
}
const turntable = group("turntable", turntableKids, { position: [0, 0, 0], rotation: [0, 0.35, 0] }).runtime({ id: "turntable", mutable: true });

// ---- Fixed base: drum (hides the reflection from the side) and ring light ----
const drum = primitives.cylinder({
  name: "drum",
  size: [6.8, 2.2, 6.8],
  material: material.pbr({ name: "drum", color: "#050608", roughness: 0.5, metallic: 0.5 }),
  position: [0, -1.1, 0],
  castShadow: false,
  params: { radialSegments: 96, openEnded: true }
});
const ringLight = primitives.cylinder({
  name: "ring-light",
  size: [6.84, 0.1, 6.84],
  material: material.emissive({ name: "ring light", color: "#0a1a2e", emissive: "#4aa3ff", emissiveIntensity: 2.6 }),
  position: [0, -0.07, 0],
  castShadow: false,
  params: { radialSegments: 96, openEnded: true }
});

// ---- Soft-box strips (visible emitters) ----
const stripMat = material.emissive({ name: "strip", color: "#ffffff", emissive: "#fff6ea", emissiveIntensity: 3.5 });
const stripTop = primitives.box({ name: "strip-top", size: [7, 0.07, 0.32], material: stripMat, position: [0, 3.9, -0.8], castShadow: false });
const stripLeft = primitives.box({ name: "strip-left", size: [0.12, 3.2, 0.34], material: stripMat, position: [-4.6, 1.9, -1.2], castShadow: false });
const stripRight = primitives.box({ name: "strip-right", size: [0.34, 3.2, 0.12], material: stripMat, position: [2.4, 1.9, -4.6], castShadow: false });

const sc = scene({ background: "#04050a" })
  .camera(camera.perspective({ position: [5.9, 1.7, 7.3], target: [0, 0.6, 0], fov: 31, near: 0.5, far: 80 }))
  .add(environments.neutral({ intensity: 0.6, background: false }))
  .add(lights.hemisphere({ skyColor: "#2a3550", groundColor: "#05060a", intensity: 0.25 }))
  // long soft-box strips above and to the sides
  .add(lights.rect({ name: "soft-top", position: [0, 3.9, -0.8], target: [0, 0.6, 0], width: 7, height: 0.32, intensity: 12, color: "#fff4e6" }))
  .add(lights.rect({ name: "soft-left", position: [-4.6, 1.9, -1.2], target: [0, 0.7, 0], width: 3.2, height: 0.34, intensity: 10, color: "#ffffff" }))
  .add(lights.rect({ name: "soft-right", position: [2.4, 1.9, -4.6], target: [0, 0.7, 0], width: 3.2, height: 0.34, intensity: 10, color: "#ffffff" }))
  // faint cool rim
  .add(lights.directional({ name: "rim", position: [-3, 2.5, -5], target: [0, 0.8, 0], intensity: 1.6, color: "#6fa8ff" }))
  .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.5 }))
  .add(stripTop)
  .add(stripLeft)
  .add(stripRight)
  .add(drum)
  .add(ringLight)
  .add(turntable);

const app = createAuraApp("#app", { scene: sc });

let angleDeg = 0;
const SPEED_DEG = 20;
const BASE_RAD = 0.35;
window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };

app.onFrame((f) => {
  angleDeg += SPEED_DEG * f.dt;
  app.nodes.require("turntable").setRotation(0, BASE_RAD + (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
});

await app.ready();
window.__EVAL_READY__ = true;
