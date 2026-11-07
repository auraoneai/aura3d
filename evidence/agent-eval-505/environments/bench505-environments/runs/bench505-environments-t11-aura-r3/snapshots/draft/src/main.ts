import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene, sky } from "@aura3d/engine";

// Floating islands at sunset. Everything is procedural: rock undersides are inverted tapered cylinders,
// grass tops are flat cylinders, trees and crystals are stacked primitives, clouds are flattened spheres.

type V3 = [number, number, number];
type Child = NonNullable<Parameters<typeof group>[1]>[number];

const DEG = Math.PI / 180;
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------- sun ----------
const SUN_EL = 4;
const SUN_AZ = 20;
const dirFrom = (elDeg: number, azDeg: number): V3 => {
  const e = elDeg * DEG;
  const a = azDeg * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const SUN_DIR = dirFrom(SUN_EL, SUN_AZ);

// ---------- materials ----------
const grassA = material.pbr({ color: "#7cb450", roughness: 0.95 });
const grassB = material.pbr({ color: "#a2c85e", roughness: 0.95 });
const soil = material.pbr({ color: "#8d6247", roughness: 1 });
const rocks = [
  material.pbr({ color: "#74606c", roughness: 1 }),
  material.pbr({ color: "#86707a", roughness: 1 }),
  material.pbr({ color: "#605063", roughness: 1 })
];
const trunk = material.pbr({ color: "#6e4631", roughness: 1 });
const leaves = [
  material.pbr({ color: "#3f8c4c", roughness: 0.95 }),
  material.pbr({ color: "#5aa450", roughness: 0.95 }),
  material.pbr({ color: "#2f7c56", roughness: 0.95 }),
  material.pbr({ color: "#86ac4c", roughness: 0.95 })
];
const crystalPink = material.emissive({ color: "#ff9ad6", emissive: "#ff5fb8", emissiveIntensity: 1.4, roughness: 0.3 });
const crystalCyan = material.emissive({ color: "#9ae8ff", emissive: "#46c8ff", emissiveIntensity: 1.4, roughness: 0.3 });
const cloudLit = material.pbr({ color: "#ffdcc8", roughness: 1, emissive: "#ff9d8a", emissiveIntensity: 0.28 });
const cloudShade = material.pbr({ color: "#e9a9bd", roughness: 1, emissive: "#c0709a", emissiveIntensity: 0.22 });
const waterMat = material.pbr({ color: "#d4ecff", roughness: 0.4, emissive: "#9fd6ff", emissiveIntensity: 0.7, opacity: 0.6, alphaMode: "blend" });
const dropMat = material.pbr({ color: "#f0faff", roughness: 0.3, emissive: "#c4e8ff", emissiveIntensity: 0.9 });
const sunMat = material.pbr({ color: "#fff3c8", unlit: true, fog: false, emissive: "#ffe6a0", emissiveIntensity: 2 });
const haloMat = material.pbr({ color: "#ff9a5c", unlit: true, fog: false, opacity: 0.4, alphaMode: "blend" });

// ---------- islands ----------
interface IslandDef {
  id: string;
  pos: V3;
  r: number;
  bob: number;
  speed: number;
  phase: number;
  trees: number;
  crystals: number;
}

const islandDefs: IslandDef[] = [
  { id: "isle-main", pos: [-14, 8, -38], r: 16, bob: 1.3, speed: 0.42, phase: 0.0, trees: 6, crystals: 2 },
  { id: "isle-b", pos: [26, 14, -30], r: 9, bob: 1.0, speed: 0.6, phase: 1.7, trees: 4, crystals: 1 },
  { id: "isle-c", pos: [-44, 19, -20], r: 7, bob: 0.9, speed: 0.75, phase: 3.1, trees: 3, crystals: 1 },
  { id: "isle-d", pos: [14, 4, -85], r: 11, bob: 1.4, speed: 0.34, phase: 4.4, trees: 5, crystals: 1 },
  { id: "isle-e", pos: [46, 22, -65], r: 6, bob: 0.8, speed: 0.82, phase: 2.2, trees: 3, crystals: 1 },
  { id: "isle-f", pos: [-52, 6, -100], r: 13, bob: 1.5, speed: 0.3, phase: 5.3, trees: 5, crystals: 2 },
  { id: "isle-g", pos: [24, 26, -14], r: 5, bob: 0.7, speed: 0.9, phase: 0.8, trees: 2, crystals: 1 },
  { id: "isle-h", pos: [62, 8, -112], r: 8, bob: 1.1, speed: 0.5, phase: 3.9, trees: 3, crystals: 1 },
  { id: "isle-i", pos: [-24, 15, -8], r: 4, bob: 0.6, speed: 1.0, phase: 2.6, trees: 2, crystals: 0 },
  { id: "isle-j", pos: [8, -4, -150], r: 18, bob: 1.8, speed: 0.26, phase: 1.1, trees: 6, crystals: 2 },
  { id: "isle-k", pos: [-74, 12, -62], r: 5, bob: 0.9, speed: 0.7, phase: 4.8, trees: 2, crystals: 1 },
  { id: "isle-l", pos: [76, 16, -48], r: 6, bob: 1.0, speed: 0.55, phase: 5.9, trees: 3, crystals: 0 }
];

const buildTree = (x: number, z: number, s: number, i: number): Child[] => {
  const leaf = leaves[i % leaves.length];
  if (i % 2 === 0) {
    return [
      primitives.cylinder({ name: `trunk-${i}`, size: [0.35 * s, 1.2 * s, 0.35 * s], material: trunk, params: { radialSegments: 6 } }).position(x, 0.5 * s, z),
      primitives.cylinder({ name: `pine-a-${i}`, size: [1.8 * s, 2.2 * s, 1.8 * s], material: leaf, params: { radialSegments: 7, radiusTop: 0.02, radiusBottom: 0.5 } }).position(x, 2.0 * s, z),
      primitives.cylinder({ name: `pine-b-${i}`, size: [1.3 * s, 1.7 * s, 1.3 * s], material: leaf, params: { radialSegments: 7, radiusTop: 0.02, radiusBottom: 0.5 } }).position(x, 3.25 * s, z)
    ];
  }
  return [
    primitives.cylinder({ name: `trunk-${i}`, size: [0.3 * s, 1.4 * s, 0.3 * s], material: trunk, params: { radialSegments: 6 } }).position(x, 0.6 * s, z),
    primitives.sphere({ name: `crown-${i}`, size: [1.9 * s, 1.7 * s, 1.9 * s], material: leaf, params: { widthSegments: 9, heightSegments: 6 } }).position(x, 1.9 * s, z)
  ];
};

const buildCrystalCluster = (x: number, z: number, scale: number, ci: number): Child[] => {
  const out: Child[] = [];
  const count = 2;
  for (let k = 0; k < count; k += 1) {
    const h = range(1.4, 2.6) * scale;
    const w = range(0.5, 0.75) * scale;
    const mat = (ci + k) % 2 === 0 ? crystalPink : crystalCyan;
    const ox = x + (k === 0 ? -0.35 : 0.4) * scale;
    const oz = z + (k === 0 ? 0.2 : -0.25) * scale;
    out.push(
      group(`crystal-${ci}-${k}`, [
        primitives.cylinder({ name: `c-prism-${ci}-${k}`, size: [w, h * 0.7, w], material: mat, params: { radialSegments: 6 } }).position(0, h * 0.35, 0),
        primitives.cylinder({ name: `c-tip-${ci}-${k}`, size: [w, h * 0.4, w], material: mat, params: { radialSegments: 6, radiusTop: 0.01, radiusBottom: 0.5 } }).position(0, h * 0.9, 0)
      ], { position: [ox, 0, oz], rotation: [range(-0.25, 0.25), range(0, 3), range(-0.25, 0.25)] })
    );
  }
  return out;
};

const buildIsland = (d: IslandDef) => {
  const r = d.r;
  const gh = 0.9 + 0.05 * r;
  const kids: Child[] = [];

  // grassy surface (top at y = 0) and a soil band under it
  kids.push(primitives.cylinder({ name: `${d.id}-grass`, size: [2 * r, gh, 2 * r], material: grassA, params: { radialSegments: 18, radiusTop: 0.47, radiusBottom: 0.5 } }).position(0, -gh / 2, 0));
  kids.push(primitives.cylinder({ name: `${d.id}-soil`, size: [1.92 * r, gh * 1.5, 1.92 * r], material: soil, params: { radialSegments: 18, radiusTop: 0.5, radiusBottom: 0.42 } }).position(0, -gh * 1.35, 0));

  // chunky rock underside: inverted cones plus lumps
  const mainH = 1.3 * r + 2;
  const top = -gh * 1.8;
  kids.push(primitives.cylinder({ name: `${d.id}-rock-main`, size: [1.7 * r, mainH, 1.7 * r], material: rocks[0], params: { radialSegments: 7, radiusTop: 0.5, radiusBottom: 0.03 } })
    .position(0, top - mainH / 2, 0).rotate(0, range(0, 3), 0));
  kids.push(primitives.sphere({ name: `${d.id}-rock-lump`, size: [1.25 * r, 0.85 * r, 1.15 * r], material: rocks[1], params: { widthSegments: 9, heightSegments: 6 } })
    .position(0.3 * r, top - 0.25 * r, -0.1 * r).rotate(0, range(0, 3), 0));
  const side = 1.05 * r + 1.5;
  kids.push(primitives.cylinder({ name: `${d.id}-rock-side`, size: [1.0 * r, side, 0.9 * r], material: rocks[2], params: { radialSegments: 6, radiusTop: 0.5, radiusBottom: 0.04 } })
    .position(-0.38 * r, top - 0.08 * r - side / 2, 0.22 * r).rotate(0, range(0, 3), 0));
  const tail = 0.8 * r + 1;
  kids.push(primitives.cylinder({ name: `${d.id}-rock-tail`, size: [0.55 * r, tail, 0.5 * r], material: rocks[1], params: { radialSegments: 5, radiusTop: 0.5, radiusBottom: 0.05 } })
    .position(0.1 * r, top - mainH * 0.8 - tail / 2, 0.08 * r));
  kids.push(primitives.sphere({ name: `${d.id}-rock-chunk`, size: [0.4 * r, 0.3 * r, 0.38 * r], material: rocks[0], params: { widthSegments: 7, heightSegments: 5 } })
    .position(-0.55 * r, top - mainH * 0.55, -0.3 * r));

  // a grassy mound
  kids.push(primitives.sphere({ name: `${d.id}-hill`, size: [0.6 * r, 0.3 * r, 0.52 * r], material: grassB, params: { widthSegments: 12, heightSegments: 6 } })
    .position(range(-0.35, 0.35) * r, -0.02 * r, range(-0.3, 0.1) * r));

  // trees
  const treeScale = Math.min(1.1, 0.55 + r / 16);
  for (let i = 0; i < d.trees; i += 1) {
    const a = range(0, Math.PI * 2);
    const rad = Math.sqrt(rand()) * 0.75 * r;
    kids.push(...buildTree(Math.cos(a) * rad, Math.sin(a) * rad, range(0.9, 1.4) * treeScale, i));
  }

  // crystals
  for (let c = 0; c < d.crystals; c += 1) {
    const a = range(0, Math.PI * 2);
    const rad = range(0.35, 0.65) * r;
    kids.push(...buildCrystalCluster(Math.cos(a) * rad, Math.sin(a) * rad, Math.min(1.3, 0.6 + r / 16), d.id.length * 10 + c));
  }

  return group(d.id, kids, { position: d.pos }).runtime({ id: d.id, mutable: true });
};

// ---------- clouds ----------
interface CloudDef {
  x: number;
  y: number;
  z: number;
  s: number;
  speed: number;
}

const cloudDefs: CloudDef[] = [
  { x: -55, y: -4, z: -5, s: 1.5, speed: 0.9 },
  { x: 35, y: -6, z: -20, s: 1.7, speed: 0.7 },
  { x: -10, y: -14, z: -55, s: 2.2, speed: 0.5 },
  { x: 65, y: -10, z: -65, s: 2.0, speed: 0.6 },
  { x: -85, y: -22, z: -100, s: 2.8, speed: 0.4 },
  { x: 25, y: -30, z: -120, s: 3.0, speed: 0.35 },
  { x: -35, y: 30, z: -75, s: 1.5, speed: 0.5 },
  { x: 55, y: 34, z: -105, s: 1.8, speed: 0.4 },
  { x: -75, y: 40, z: -135, s: 2.2, speed: 0.3 },
  { x: 0, y: 28, z: -165, s: 2.6, speed: 0.25 },
  { x: 50, y: 2, z: -10, s: 1.2, speed: 1.1 },
  { x: -42, y: 24, z: -38, s: 1.0, speed: 0.8 },
  { x: 95, y: 14, z: -150, s: 2.4, speed: 0.3 },
  { x: -25, y: -18, z: -100, s: 2.0, speed: 0.45 }
];

// [dx, dy, dz, sx, sy, sz, lit]
const puffs: [number, number, number, number, number, number, boolean][] = [
  [0, 0, 0, 16, 5, 8, false],
  [-10, 0.3, 1.5, 11, 4, 6.5, false],
  [9, 0.4, -1, 12, 4.4, 7, false],
  [-4, 2.4, 0, 10, 5.5, 6, true],
  [5, 2.2, 1.5, 8.5, 4.5, 5, true],
  [-12, 1.8, -2, 6, 3.5, 4, true]
];

const buildCloud = (c: CloudDef, i: number) =>
  group(`cloud-${i}`, puffs.map((p, k) =>
    primitives.sphere({
      name: `cloud-${i}-puff-${k}`,
      size: [p[3] * c.s, p[4] * c.s, p[5] * c.s],
      material: p[6] ? cloudLit : cloudShade,
      params: { widthSegments: 14, heightSegments: 8 },
      castShadow: false,
      receiveShadow: false
    }).position(p[0] * c.s, p[1] * c.s, p[2] * c.s)
  ), { position: [c.x, c.y, c.z] }).runtime({ id: `cloud-${i}`, mutable: true });

const cloudHalfWidth = (z: number): number => 90 + 0.85 * (34 - z);

// ---------- waterfall (from the largest island) ----------
const main = islandDefs[0];
const FALL = 45;
const DROPS = 36;
const rimLocal: V3 = [-0.31 * main.r * 1.02, 0, 0.95 * main.r * 1.02];
const dropJitter = Array.from({ length: DROPS }, () => ({ x: range(-0.5, 0.5), z: range(-0.5, 0.5), v: range(0.9, 1.1) }));

// ---------- camera ----------
const PERIOD = 50; // seconds per full loop
const camPose = (t: number): { position: V3; target: V3 } => {
  const w = (2 * Math.PI * t) / PERIOD;
  const th = 0.5 * Math.sin(w);
  const R = 80 + 4 * Math.cos(2 * w);
  return {
    position: [Math.sin(th) * R, 16 + 3.5 * Math.sin(w + 1.0), -48 + Math.cos(th) * R],
    target: [-4 * Math.sin(w), 4 + 1.5 * Math.cos(w), -48]
  };
};
const start0 = camPose(0);

// ---------- scene ----------
const sceneBuilder = scene({ background: "#f4a27c" })
  .add(sky.gradient({
    zenith: "#5c5aa6",
    horizon: "#ff9a64",
    ground: "#e48a80",
    exponent: 0.85,
    horizonGlow: 0.5,
    bands: [{ elevationDeg: 16, widthDeg: 18, color: "#ff6aa0", intensity: 0.35 }],
    sun: { elevationDeg: SUN_EL, azimuthDeg: SUN_AZ, intensity: 1, color: "#ffcf8a", discSize: 0.04 },
    captureEnvironment: false,
    affectsFog: false
  }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffb48f", groundColor: "#8a62a8", intensity: 0.9 }))
  .add(lights.directional({ name: "sun-key", position: [SUN_DIR[0] * 120, SUN_DIR[1] * 120 + 25, SUN_DIR[2] * 120 - 40], target: [0, 0, -50], intensity: 3.0, color: "#ffb070" }))
  .add(lights.directional({ name: "fill", position: [-50, 45, 90], target: [0, 0, -50], intensity: 1.7, color: "#ffd8c4" }))
  .add(effects.fog({ color: "#b9a9d6", density: 0.0065 }));

for (const d of islandDefs) sceneBuilder.add(buildIsland(d));
cloudDefs.forEach((c, i) => sceneBuilder.add(buildCloud(c, i)));

// waterfall nodes
sceneBuilder.add(primitives.cylinder({
  name: "waterfall",
  size: [1.0, FALL, 1.0],
  material: waterMat,
  params: { radialSegments: 8, radiusTop: 0.5, radiusBottom: 0.32 },
  castShadow: false
}).position(0, 0, 0).runtime({ id: "waterfall", mutable: true }));
for (let i = 0; i < DROPS; i += 1) {
  sceneBuilder.add(primitives.sphere({ name: `drop-${i}`, size: 0.55, material: dropMat, params: { widthSegments: 6, heightSegments: 4 }, castShadow: false })
    .position(0, 0, 0).runtime({ id: `drop-${i}`, mutable: true }));
}
sceneBuilder.add(primitives.sphere({ name: "mist-top", size: [2.6, 1.4, 2.6], material: cloudLit, params: { widthSegments: 10, heightSegments: 6 }, castShadow: false })
  .position(0, 0, 0).runtime({ id: "mist-top", mutable: true }));
sceneBuilder.add(primitives.sphere({ name: "mist-bottom", size: [9, 3, 7], material: cloudLit, params: { widthSegments: 12, heightSegments: 6 }, castShadow: false })
  .position(0, 0, 0).runtime({ id: "mist-bottom", mutable: true }));

// sun disc and halo (follow the camera so they sit at the sky sun's direction)
sceneBuilder.add(primitives.sphere({ name: "sun-halo", size: 105, material: haloMat, params: { widthSegments: 32, heightSegments: 16 }, castShadow: false, receiveShadow: false })
  .position(0, 0, 0).runtime({ id: "sun-halo", mutable: true }));
sceneBuilder.add(primitives.sphere({ name: "sun-disc", size: 56, material: sunMat, params: { widthSegments: 32, heightSegments: 16 }, castShadow: false, receiveShadow: false })
  .position(0, 0, 0).runtime({ id: "sun-disc", mutable: true }));

sceneBuilder
  .add(effects.bloom({ intensity: 0.45, threshold: 0.88, radius: 0.55 }))
  .add(effects.vignette({ intensity: 0.22 }))
  .camera(camera.perspective({ position: start0.position, target: start0.target, fov: 50, near: 0.5, far: 900 }));

const app = createAuraApp("#app", { scene: sceneBuilder });

const t0 = performance.now();
let firstFrame = true;

app.onFrame(() => {
  const t = (performance.now() - t0) / 1000;

  // camera arc
  const cam = camPose(t);
  app.camera?.setPose({ position: cam.position, target: cam.target });

  // sun follows camera
  const sp: V3 = [cam.position[0] + SUN_DIR[0] * 300, cam.position[1] + SUN_DIR[1] * 300, cam.position[2] + SUN_DIR[2] * 300];
  const hp: V3 = [cam.position[0] + SUN_DIR[0] * 322, cam.position[1] + SUN_DIR[1] * 322, cam.position[2] + SUN_DIR[2] * 322];
  app.nodes.require("sun-disc").setPosition(sp[0], sp[1], sp[2]);
  app.nodes.require("sun-halo").setPosition(hp[0], hp[1], hp[2]);

  // island bobbing
  let mainY = main.pos[1];
  for (const d of islandDefs) {
    const y = d.pos[1] + Math.sin(t * d.speed + d.phase) * d.bob;
    if (d === main) mainY = y;
    app.nodes.require(d.id).setPosition(d.pos[0], y, d.pos[2]);
  }

  // clouds drift along +x, wrapping outside the view
  cloudDefs.forEach((c, i) => {
    const hw = cloudHalfWidth(c.z);
    let x = c.x + c.speed * t;
    x = ((((x + hw) % (2 * hw)) + 2 * hw) % (2 * hw)) - hw;
    app.nodes.require(`cloud-${i}`).setPosition(x, c.y + Math.sin(t * 0.15 + i) * 0.6, c.z);
  });

  // waterfall
  const rx = main.pos[0] + rimLocal[0];
  const rz = main.pos[2] + rimLocal[2];
  const ry = mainY;
  app.nodes.require("waterfall").setPosition(rx, ry - FALL / 2 + 0.2, rz);
  app.nodes.require("mist-top").setPosition(rx, ry + 0.2, rz);
  app.nodes.require("mist-bottom").setPosition(rx, ry - FALL + 1, rz + 1);
  for (let i = 0; i < DROPS; i += 1) {
    const j = dropJitter[i];
    const u = (t * 0.3 * j.v + i / DROPS) % 1;
    const fall = Math.pow(u, 1.4) * FALL;
    const spread = 0.2 + u * 0.9;
    const h = app.nodes.require(`drop-${i}`);
    h.setPosition(rx + j.x * spread, ry + 0.3 - fall, rz + j.z * spread);
    h.setScale(1 - 0.5 * u);
  }

  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
    });
  }
});

void app.ready();
