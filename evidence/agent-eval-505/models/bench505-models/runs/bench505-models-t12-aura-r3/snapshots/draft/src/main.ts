import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  interactions,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";
import { addBranch, addTube, farGroundGeometry, leafBlobGeometry, moundGeometry, newAcc, toGeometry } from "./meshes";
import { buildTree, mulberry32, moundHeight, type V3 } from "./tree";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
  }
}

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get("seed"));
const SEED = params.has("seed") && Number.isFinite(seedParam) ? Math.trunc(seedParam) : 20240611;
const AUTUMN = params.get("season") === "autumn";

const PALETTE = AUTUMN
  ? ["#7e2a1c", "#a8391f", "#cf5a1e", "#e38a22", "#efb735", "#b8a02a"]
  : ["#1f5a2b", "#2f7a33", "#43923a", "#5fa83f", "#86bb48", "#b2cf55"];
const FALLEN = AUTUMN ? PALETTE : ["#b8a02a", "#cf8a22", "#8a5a2a", "#86bb48", "#a8391f"];

const tree = buildTree(SEED);

// ---- Wood: trunk, roots, limbs, branches and twigs in one vertex-coloured mesh.
const wood = newAcc();
tree.branches.forEach((b, i) => addBranch(wood, b, i * 1.7 + 0.3));

// ---- Details mesh: ropes for the swing and the bird house.
const ropes = newAcc();
const ropeColor: [number, number, number] = [0.5, 0.4, 0.24];
const rope = (a: V3, b: V3): void => {
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  addTube(ropes, [a, mid, b], [0.028, 0.028, 0.028], { radial: 5, bark: 0.1, phase: 1, color: ropeColor, cap: true });
};

// Rope swing under the lowest big limb.
const swingTop = tree.swing.limb.p;
const sθ = tree.swing.azimuth;
const perp: V3 = [Math.cos(sθ), 0, -Math.sin(sθ)];
const plankDrop = Math.min(2.3, Math.max(0.9, swingTop[1] - moundHeight(swingTop[0], swingTop[2]) - 0.8));
const plank: V3 = [swingTop[0], swingTop[1] - plankDrop, swingTop[2]];
for (const s of [-1, 1]) {
  rope(
    [swingTop[0] + perp[0] * 0.1 * s, swingTop[1] - 0.04, swingTop[2] + perp[2] * 0.1 * s],
    [plank[0] + perp[0] * 0.3 * s, plank[1], plank[2] + perp[2] * 0.3 * s]
  );
}

// Bird house hanging from the second limb.
const hang = tree.birdhouse.limb.p;
const bθ = tree.birdhouse.azimuth;
const front: V3 = [Math.sin(bθ), 0, Math.cos(bθ)];
const apexY = hang[1] - 0.8;
const roofY = apexY - 0.175;
const bodyY = apexY - 0.35 - 0.22;
rope([hang[0], hang[1] - 0.04, hang[2]], [hang[0], apexY, hang[2]]);

const woodMat = material.pbr({ color: "#ffffff", roughness: 0.92 });
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });

// ---- Foliage: one lumpy blob mesh, instanced per clump with its own size, yaw and tone.
const clumpTransforms: AuraTransformSpec[] = tree.clumps.map((c) => ({
  position: c.position,
  rotation: [0, c.rotationY, 0],
  scale: c.scale
}));
const clumpColors = tree.clumps.map((c) => PALETTE[Math.min(PALETTE.length - 1, Math.floor(c.tone * PALETTE.length))]);

// ---- Ground details (seeded, independent of the branch layout stream).
const drng = mulberry32(SEED + 101);
const between = (a: number, b: number): number => a + (b - a) * drng();

const leafTransforms: AuraTransformSpec[] = [];
const leafColors: string[] = [];
for (let i = 0; i < 36; i += 1) {
  const a = between(0, Math.PI * 2);
  const r = between(1.7, 6.5);
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  const s = between(0.8, 1.3);
  leafTransforms.push({
    position: [x, moundHeight(x, z) + 0.03, z],
    rotation: [between(-0.15, 0.15), between(0, Math.PI * 2), between(-0.15, 0.15)],
    scale: [0.2 * s, 0.014, 0.12 * s]
  });
  leafColors.push(FALLEN[Math.floor(drng() * FALLEN.length)]);
}

const stemTransforms: AuraTransformSpec[] = [];
const capTransforms: AuraTransformSpec[] = [];
const capColors: string[] = [];
const mushrooms: Array<[number, number, number]> = [
  [0.35, 1.95, 1.0],
  [0.55, 2.2, 0.65],
  [0.2, 2.15, 0.8],
  [3.5, 2.0, 0.9],
  [3.7, 2.25, 0.6]
];
for (const [a, r, s] of mushrooms) {
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  const h = moundHeight(x, z);
  stemTransforms.push({ position: [x, h + 0.09 * s, z], scale: [0.09 * s, 0.18 * s, 0.09 * s] });
  capTransforms.push({ position: [x, h + 0.19 * s, z], scale: [0.32 * s, 0.17 * s, 0.32 * s] });
  capColors.push(s > 0.8 ? "#c8332b" : "#d9602b");
}

// ---- Knot / hollow on the trunk.
const kθ = tree.knot.azimuth;
const kf: V3 = [Math.sin(kθ), 0, Math.cos(kθ)];
const kc = tree.knot.center;
const kR = tree.knot.radius;
const knotPos = (k: number): V3 => [kc[0] + kf[0] * kR * k, kc[1], kc[2] + kf[2] * kR * k];

// ---- Camera framing from the generated tree.
const FOV = 38;
const tanH = Math.tan((FOV / 2) * (Math.PI / 180));
const centerY = tree.top / 2 + 0.2;
const halfH = (tree.top / 2) * 1.12;
const dist = Math.max(halfH / tanH + tree.reach * 0.3, (tree.reach * 1.08) / (tanH * (16 / 9)) + tree.reach * 0.55);

const mound = geometry.custom(moundGeometry(), { name: "mound", material: white, castShadow: false });
const farGround = geometry.custom(farGroundGeometry(), { name: "far-ground", material: white, castShadow: false });

const stage = scene({ background: "#9cc4ec" })
  .add(sky.preetham({ sun: { elevationDeg: 52, azimuthDeg: 124, intensity: 1 } }))
  .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#5b6b3a", intensity: 0.7 }))
  .add(lights.directional({ name: "key", position: [18, 28, 12], target: [0, 2, 0], intensity: 3.4, color: "#fff1d8", shadow: { mapSize: 2048 } }))
  .add(effects.fog({ color: "#bcd6ec", density: 0.004 }))
  .add(farGround)
  .add(mound)
  .add(geometry.custom(toGeometry(wood), { name: "tree-wood", material: woodMat }))
  .add(geometry.custom(toGeometry(ropes), { name: "ropes", material: woodMat }))
  .add(
    instances.custom(leafBlobGeometry(), {
      name: "foliage",
      transforms: clumpTransforms,
      colors: clumpColors,
      material: material.pbr({ color: "#ffffff", roughness: 0.85 })
    })
  )
  // swing plank
  .add(primitives.box({ name: "swing-plank", size: [0.8, 0.07, 0.24], material: material.pbr({ color: "#8a6238", roughness: 0.85 }) }).position(plank[0], plank[1] - 0.03, plank[2]).rotation(0, sθ, 0))
  // bird house
  .add(primitives.box({ name: "birdhouse-body", size: [0.44, 0.44, 0.4], material: material.pbr({ color: "#d9b36a", roughness: 0.8 }) }).position(hang[0], bodyY, hang[2]).rotation(0, bθ, 0))
  .add(primitives.cone({ name: "birdhouse-roof", size: [0.88, 0.35, 0.88], params: { radialSegments: 4 }, material: material.pbr({ color: "#8c3b2a", roughness: 0.8 }) }).position(hang[0], roofY, hang[2]).rotation(0, bθ + Math.PI / 4, 0))
  .add(primitives.sphere({ name: "birdhouse-hole", size: [0.14, 0.14, 0.05], material: material.pbr({ color: "#1a0f0a", roughness: 1 }) }).position(hang[0] + front[0] * 0.205, bodyY + 0.04, hang[2] + front[2] * 0.205).rotation(0, bθ, 0))
  // trunk knot and hollow
  .add(primitives.sphere({ name: "knot-bulge", size: [0.66, 0.9, 0.36], material: material.pbr({ color: "#5a3d26", roughness: 0.95 }) }).position(...knotPos(0.95)).rotation(0, kθ, 0))
  .add(primitives.sphere({ name: "hollow", size: [0.4, 0.6, 0.24], material: material.pbr({ color: "#100905", roughness: 1 }) }).position(...knotPos(1.0)).rotation(0, kθ, 0))
  // mushrooms
  .add(instances.cylinder({ name: "mushroom-stems", transforms: stemTransforms, material: material.pbr({ color: "#efe6d2", roughness: 0.8 }), params: { radialSegments: 8 } }))
  .add(instances.sphere({ name: "mushroom-caps", transforms: capTransforms, colors: capColors, material: white }))
  // fallen leaves
  .add(instances.sphere({ name: "fallen-leaves", transforms: leafTransforms, colors: leafColors, material: white, castShadow: false }))
  .add(interactions.orbit({ target: [0, centerY, 0], autoRotate: 0.12 }))
  .camera(
    camera.orbit({
      position: [0, centerY + dist * 0.12, dist],
      target: [0, centerY, 0],
      fov: FOV,
      near: 0.5,
      far: 600
    })
  );

const app = createAuraApp("#app", { scene: stage });

let signalled = false;
app.onFrame(() => {
  if (signalled) return;
  signalled = true;
  // Wait until the frame that was just scheduled has been presented.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.__TASK_STATE__ = {
        ready: true,
        branchCount: tree.branches.length,
        foliageClumpCount: tree.clumps.length,
        seed: SEED
      };
      window.__EVAL_READY__ = true;
    })
  );
});
await app.ready();
