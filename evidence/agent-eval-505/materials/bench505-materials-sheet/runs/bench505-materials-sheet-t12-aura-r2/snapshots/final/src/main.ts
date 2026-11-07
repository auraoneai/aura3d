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
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { materials: string[]; cameraAzimuthDeg: number };
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------- marble texture
const hash2 = (ix: number, iy: number, seed: number): number => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const vnoise = (x: number, y: number, seed: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const fbm = (x: number, y: number, seed: number, octaves: number): number => {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * vnoise(x * f, y * f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const marbleTexture = (seed: number, angle: number, size = 512) => {
  const data = new Uint8ClampedArray(size * size * 4);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x / size) * 4, py = (y / size) * 4;
      const cloud = fbm(px * 2.2, py * 2.2, seed + 5, 5);
      // main veins: stripes warped by turbulence
      const t1 = (px * ca + py * sa) * 1.5 + 3.4 * fbm(px * 0.8 + 5, py * 0.8 + 9, seed + 1, 4);
      const m1 = smooth(0.38, 0.62, fbm(px * 1.3 + 11, py * 1.3, seed + 2, 3));
      const v1 = Math.pow(1 - Math.abs(Math.sin(t1 * Math.PI)), 14) * m1;
      // fine secondary veins
      const t2 = (px * sa - py * ca) * 3.3 + 4.2 * fbm(px * 1.7 + 2, py * 1.7, seed + 3, 4);
      const m2 = smooth(0.4, 0.7, fbm(px * 2 + 3, py * 2 + 7, seed + 4, 3));
      const v2 = Math.pow(1 - Math.abs(Math.sin(t2 * Math.PI)), 26) * m2;
      const haze = smooth(0.45, 0.8, fbm(px * 1.1 + 20, py * 1.1 + 4, seed + 6, 4)) * 0.22;
      const k = Math.min(1, v1 * 0.85 + v2 * 0.5 + haze * 0.5);
      const br = cloud;
      const r = 247 - 20 * br, g = 245 - 20 * br, b = 241 - 19 * br;
      const i = (y * size + x) * 4;
      data[i] = r + (118 - r) * k;
      data[i + 1] = g + (122 - g) * k;
      data[i + 2] = b + (130 - b) * k;
      data[i + 3] = 255;
    }
  }
  return texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "srgb" });
};

const marbleMat = (seed: number, angle: number) =>
  material.physical({
    color: "#ffffff",
    texture: marbleTexture(seed, angle),
    metallic: 0,
    roughness: 0.16,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.9
  });

const marbleBase = marbleMat(11, 0.6);
const marbleShaft = marbleMat(23, 1.15);
const marbleCap = marbleMat(37, 0.2);

// ---------------------------------------------------------------- materials
const gold = material.pbr({ color: "#ffc95e", metallic: 1, roughness: 0.14, envMapIntensity: 1.8 });
const darkGold = material.pbr({ color: "#8a6522", metallic: 1, roughness: 0.48, envMapIntensity: 1.2 });
const darkstone = material.physical({
  color: "#0c0c0f",
  metallic: 0,
  roughness: 0.1,
  clearcoat: 0.8,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1
});
const wallMat = material.pbr({ color: "#3b2d23", roughness: 0.92 });
const floorMat = material.pbr({ color: "#2a211b", roughness: 0.42, metallic: 0, envMapIntensity: 0.5 });
const windowMat = material.emissive({ color: "#fff1d6", emissive: "#ffdca0", emissiveIntensity: 2.2 });
const lampMat = material.emissive({ color: "#ffe3b0", emissive: "#ffb85c", emissiveIntensity: 3 });

// ---------------------------------------------------------------- trophy profiles
const cupY = (t: number): number => 0.44 + 0.36 * t;
const cupR = (t: number): number => 0.045 + 0.205 * Math.pow(Math.sin((t * Math.PI) / 2), 0.9);

const profile: V3[] = [
  [0, 0, 0], [0.16, 0, 0], [0.17, 0.012, 0], [0.17, 0.03, 0], [0.15, 0.047, 0], [0.11, 0.064, 0],
  [0.075, 0.095, 0], [0.05, 0.14, 0], [0.036, 0.19, 0]
];
for (let i = 0; i <= 10; i += 1) {
  const s = i / 10;
  profile.push([0.034 + 0.042 * Math.sin(Math.PI * s), 0.22 + 0.1 * s, 0]);
}
profile.push([0.03, 0.35, 0], [0.036, 0.4, 0], [0.043, 0.43, 0]);
for (let i = 0; i <= 28; i += 1) {
  const t = i / 28;
  profile.push([cupR(t), cupY(t), 0]);
}
profile.push([cupR(1) + 0.004, 0.806, 0], [cupR(1) - 0.006, 0.81, 0]);
for (let i = 28; i >= 3; i -= 1) {
  const t = i / 28;
  profile.push([cupR(t) - 0.014, cupY(t), 0]);
}
profile.push([0.035, 0.468, 0], [0, 0.465, 0]);

const bandProfile: V3[] = [[cupR(0.14) - 0.002, cupY(0.14), 0], [cupR(0.14) + 0.004, cupY(0.14) + 0.001, 0]];
for (let i = 0; i <= 8; i += 1) {
  const t = 0.14 + (0.16 * i) / 8;
  bandProfile.push([cupR(t) + 0.0055, cupY(t), 0]);
}
bandProfile.push([cupR(0.3) + 0.004, cupY(0.3) - 0.001, 0], [cupR(0.3) - 0.002, cupY(0.3), 0]);

const footBand: V3[] = [[0.166, 0.008, 0], [0.176, 0.013, 0], [0.176, 0.028, 0], [0.166, 0.034, 0]];

const handlePoints = (sign: number): V3[] => {
  const yA = cupY(0.17), yB = cupY(0.68), mid = (yA + yB) / 2;
  const xA = cupR(0.17) - 0.012, xB = cupR(0.68) - 0.012;
  const pts: [number, number][] = [
    [xA, yA], [xA + 0.07, yA - 0.035], [0.275, yA + 0.02], [0.33, mid], [0.305, yB - 0.025], [xB + 0.075, yB + 0.035], [xB, yB]
  ];
  return pts.map(([x, y]): V3 => [sign * x, y, 0]);
};

const trophy = group(
  "trophy",
  [
    primitives.lathe({ name: "trophy-body", material: gold, params: { points: profile, radialSegments: 72 } }),
    primitives.lathe({ name: "cup-band", material: darkGold, params: { points: bandProfile, radialSegments: 72 } }),
    primitives.lathe({ name: "foot-band", material: darkGold, params: { points: footBand, radialSegments: 72 } }),
    primitives.tube({ name: "handle-r", material: gold, params: { path: handlePoints(1), radius: 0.013, tubularSegments: 56, radialSegments: 14 } }),
    primitives.tube({ name: "handle-l", material: gold, params: { path: handlePoints(-1), radius: 0.013, tubularSegments: 56, radialSegments: 14 } })
  ],
  { position: [0, 1.54, 0], scale: 1.2 }
);

// ---------------------------------------------------------------- scene
const TARGET: V3 = [0, 1.3, 0];
const DIST = 5.6;
const CAM_Y = 1.95;

let sc = scene({ background: "#0a0706" })
  .camera(camera.perspective({ position: [0, CAM_Y, DIST], target: TARGET, fov: 36, near: 0.3, far: 60 }))
  .add(environments.neutral({ intensity: 0.75, diffuseIntensity: 0.12, specularIntensity: 1, background: false }))
  .add(lights.hemisphere({ skyColor: "#3a2a22", groundColor: "#120d0a", intensity: 0.35 }))
  // warm key spot, above and in front
  .add(
    lights.spot({
      name: "key-spot",
      position: [1.2, 6.2, 4.8],
      target: [0, 1.5, 0],
      angle: 0.5,
      penumbra: 0.95,
      distance: 16,
      decay: 2,
      intensity: 95,
      color: "#ffd9a0",
      shadow: true
    })
  )
  // faint cool fill from the front left
  .add(lights.directional({ name: "fill", position: [-5, 2.5, 4], target: [0, 1.4, 0], intensity: 0.3, color: "#7f9bdc" }))
  // subtle rim from behind right
  .add(lights.directional({ name: "rim", position: [3.5, 3.2, -5], target: [0, 1.6, 0], intensity: 0.9, color: "#a9c2ff" }))
  // gallery room
  .add(primitives.plane({ name: "floor", size: [30, 1, 30], material: floorMat }))
  .add(primitives.box({ name: "back-wall", size: [18, 8, 0.3], material: wallMat, castShadow: false }).position(0, 4, -4.6))
  .add(primitives.box({ name: "left-wall", size: [0.3, 8, 16], material: wallMat, castShadow: false }).position(-8, 4, 2))
  .add(primitives.box({ name: "right-wall", size: [0.3, 8, 16], material: wallMat, castShadow: false }).position(8, 4, 2))
  .add(primitives.box({ name: "window-a", size: [1.2, 3.2, 0.06], material: windowMat, castShadow: false }).position(-3.8, 3.6, -4.42))
  .add(primitives.box({ name: "window-b", size: [1.2, 3.2, 0.06], material: windowMat, castShadow: false }).position(3.8, 3.6, -4.42))
  .add(primitives.sphere({ name: "lamp-a", size: 0.22, material: lampMat, castShadow: false }).position(-6.2, 3.4, -4.2))
  .add(primitives.sphere({ name: "lamp-b", size: 0.22, material: lampMat, castShadow: false }).position(6.2, 3.4, -4.2))
  .add(lights.point({ name: "lamp-light-a", position: [-6.2, 3.4, -3.8], intensity: 3, distance: 8, decay: 2, color: "#ffb866" }))
  .add(lights.point({ name: "lamp-light-b", position: [6.2, 3.4, -3.8], intensity: 3, distance: 8, decay: 2, color: "#ffb866" }))
  // stepped marble pedestal
  .add(primitives.box({ name: "step-1", size: [1.7, 0.14, 1.7], material: marbleBase }).position(0, 0.07, 0))
  .add(primitives.box({ name: "step-2", size: [1.4, 0.14, 1.4], material: marbleCap }).position(0, 0.21, 0))
  .add(primitives.box({ name: "shaft", size: [1.05, 1.0, 1.05], material: marbleShaft }).position(0, 0.78, 0))
  .add(primitives.box({ name: "cap", size: [1.25, 0.12, 1.25], material: marbleBase }).position(0, 1.34, 0))
  // black polished stone base with a thin gold plate
  .add(primitives.box({ name: "trophy-base", size: [0.62, 0.14, 0.62], material: darkstone }).position(0, 1.47, 0))
  .add(primitives.box({ name: "plate", size: [0.34, 0.06, 0.012], material: gold }).position(0, 1.47, 0.316))
  .add(trophy)
  .add(effects.bloom({ intensity: 0.3, threshold: 0.9, radius: 0.5 }));

const app = createAuraApp("#app", { scene: sc });

const MAX_AZ = 15;
let t = 0;
window.__TASK_STATE__ = { materials: ["marble", "gold", "darkstone"], cameraAzimuthDeg: 0 };

app.onFrame((f) => {
  t += f.dt;
  const az = MAX_AZ * Math.sin(t * 0.4);
  const r = (az * Math.PI) / 180;
  app.camera?.setPose({
    position: [Math.sin(r) * DIST, CAM_Y, Math.cos(r) * DIST],
    target: TARGET,
    fov: 36
  });
  window.__TASK_STATE__ = { materials: ["marble", "gold", "darkstone"], cameraAzimuthDeg: az };
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
