/**
 * The valley's static scenery, built into a handful of merged meshes (one draw each):
 * trees, the cottages, windmill, fences, jetty, bell frame, rocks and the far island, plus the
 * animated pieces that need their own node (windmill sails, bell, boat, traveller, letters).
 * All geometry is authored in code; nothing is copied from the original's art.
 */
import { BELL, BOUNDS, LETTERS, START, STRUCTURES, FENCE_ASPECT } from "./sim";
import { KIND, addBlob, addBox, addCylinder, addGable, addLathe, addQuad, lin, mixRgb, newMesh, scaleRgb, type Mesh, type Rgb } from "./meshkit";
import { SEA_LEVEL, lehmer, pathZ, terrainHeight, type ShadowBlob } from "./terrain";

const SUN_SHADOW = (() => {
  const x = 0.468, z = -0.374, l = Math.hypot(x, z);
  return { x: x / l, z: z / l };
})();

export interface ModelPlacement { x: number; y: number; z: number; s: number; yaw: number; variant?: number; w?: number; d?: number; h?: number }
export interface ReplacedByModels { bell?: boolean; cottage?: boolean; trees?: boolean; boat?: boolean; stones?: boolean; shrubs?: boolean }
export interface Scenery {
  /** placements of the pieces a model replaced (empty when nothing is replaced) */
  placements: { bell: ModelPlacement[]; cottages: ModelPlacement[]; pines: ModelPlacement[]; oaks: ModelPlacement[]; shrubs: ModelPlacement[]; stones: ModelPlacement[] };
  props: Mesh;
  sails: Mesh;
  boat: Mesh;
  traveller: Mesh;
  bellMesh: Mesh;
  envelope: Mesh;
  wisp: Mesh;
  blobs: ShadowBlob[];
  /** where foliage must not grow: x, z, radius */
  keepClear: { x: number; z: number; r: number }[];
  /** world positions for fixed accents */
  windmillHub: { x: number; y: number; z: number };
  bellHang: { x: number; y: number; z: number };
  boatMoor: { x: number; y: number; z: number };
  jettyEnd: { x: number; y: number; z: number };
  lanterns: { x: number; y: number; z: number }[];
  /** WW47-V4: top of the main cottage's chimney (procedural cottage; the GLB cottage uses the same footprint offset). */
  chimney: { x: number; y: number; z: number } | null;
  treeCount: number;
}

const C = {
  barkDark: lin("#4f3822"), barkLight: lin("#7b5a3a"), birch: lin("#cfc7b4"), birchDark: lin("#6a6355"),
  pineDeep: lin("#2d5a34"), pineMid: lin("#3f7a3c"), pineLight: lin("#6aa247"), pineFrost: lin("#5b8f66"),
  oakDeep: lin("#3f7a32"), oakLight: lin("#9acb4f"), oakWarm: lin("#c9c455"),
  plaster: lin("#f1e6c9"), plasterShade: lin("#d9c9a2"), stone: lin("#9b9482"), stoneDark: lin("#6f6a5c"),
  tile: lin("#b9583b"), tileDark: lin("#8f3f2c"), shingle: lin("#76503a"), wood: lin("#a98558"), woodDark: lin("#6d5030"), woodLight: lin("#c9a672"),
  cloth: lin("#f1e7c8"), gold: lin("#e0a93a"), hull: lin("#3d6d8c"), hullTrim: lin("#f0e6cc"), rock: lin("#8f8c7c")
};

const rotate = (x: number, z: number, yaw: number): [number, number] => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];

export function buildScenery(seed = 4242, replace: ReplacedByModels = {}): Scenery {
  const rand = lehmer(seed);
  const placements: Scenery["placements"] = { bell: [], cottages: [], pines: [], oaks: [], shrubs: [], stones: [] };
  const props = newMesh();
  const blobs: ShadowBlob[] = [];
  const keepClear: { x: number; z: number; r: number }[] = [];
  const lanterns: { x: number; y: number; z: number }[] = [];
  let chimney: Scenery["chimney"] = null;
  let treeCount = 0;

  const blocked = (x: number, z: number, pad = 0): boolean => {
    if (Math.abs(z - pathZ(x)) < 2.2 + pad && x > -52 && x < 58) return true;
    if (Math.hypot(x - START.x, z - START.z) < 3.4) return true;
    return keepClear.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad);
  };

  /* ---------- structures first, so trees keep clear of them ---------- */
  const cottage = (x: number, z: number, s: number, yaw: number, roof: Rgb, wall: Rgb): void => {
    const y = terrainHeight(x, z) - 0.15;
    const w = 7.2 * s, d = 5.4 * s, h = 3.6 * s;
    if (!chimney) {
      const [rx, rz] = rotate(w * 0.28, -d * 0.1, yaw);
      chimney = { x: x + rx, y: y + 0.6 * s + h + 3.9 * s, z: z + rz };
    }
    if (replace.cottage) {
      placements.cottages.push({ x, y, z, s, yaw, w, d, h: 0.6 * s + h + 3.0 * s });
      blobs.push({ x: x + SUN_SHADOW.x * 4.2, z: z + SUN_SHADOW.z * 3.2, rx: w * 0.78, rz: d * 0.78, strength: 0.5 });
      blobs.push({ x, z, rx: w * 0.62, rz: d * 0.62, strength: 0.35 });
      keepClear.push({ x, z, r: Math.max(w, d) * 0.62 + 1.5 });
      return;
    }
    const ax = (lx: number, lz: number): [number, number] => {
      const [rx, rz] = rotate(lx, lz, yaw);
      return [x + rx, z + rz];
    };
    addBox(props, { x, y: y + 0.28 * s, z, w: w + 0.3, h: 0.7 * s, d: d + 0.3, yaw, kind: KIND.stone, color: C.stoneDark, colorTop: C.stone, jitter: 0.1, rand });
    addBox(props, { x, y: y + 0.6 * s + h / 2, z, w, h, d, yaw, kind: KIND.plaster, color: scaleRgb(wall, 0.82), colorTop: wall });
    // timber frame
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [px, pz] = ax(sx * w / 2, sz * d / 2);
      addBox(props, { x: px, y: y + 0.6 * s + h / 2, z: pz, w: 0.28 * s, h: h + 0.1, d: 0.28 * s, yaw, kind: KIND.wood, color: C.woodDark });
    }
    addBox(props, { x, y: y + 0.6 * s + h - 0.05, z: z + 0, w: w + 0.1, h: 0.24 * s, d: d + 0.1, yaw, kind: KIND.wood, color: C.woodDark });
    addBox(props, { x, y: y + 0.6 * s + h * 0.55, z, w: w + 0.06, h: 0.18 * s, d: d + 0.06, yaw, kind: KIND.wood, color: scaleRgb(C.woodDark, 1.1) });
    // roof
    addGable(props, { x, y: y + 0.6 * s + h, z, w: w + 0.2, d: d, h: 3.0 * s, yaw, overhang: 0.55 * s, kind: KIND.roof, color: C.tileDark, colorTop: roof, gableColor: wall, gableKind: KIND.plaster });
    // chimney
    const [cx, cz] = ax(w * 0.28, -d * 0.1);
    addBox(props, { x: cx, y: y + 0.6 * s + h + 2.6 * s, z: cz, w: 0.95 * s, h: 2.2 * s, d: 0.95 * s, yaw, kind: KIND.stone, color: C.stoneDark, colorTop: C.stone, jitter: 0.06, rand });
    addBox(props, { x: cx, y: y + 0.6 * s + h + 3.78 * s, z: cz, w: 1.15 * s, h: 0.18 * s, d: 1.15 * s, yaw, kind: KIND.stone, color: C.stone });
    // door and windows on the +z face (towards the camera), local frame
    const [dx, dz] = ax(-w * 0.18, d / 2 + 0.02);
    addBox(props, { x: dx, y: y + 0.6 * s + 1.15 * s, z: dz, w: 1.25 * s, h: 2.3 * s, d: 0.12, yaw, kind: KIND.wood, color: C.woodDark, colorTop: C.barkLight });
    addBox(props, { x: dx, y: y + 0.6 * s + 2.35 * s, z: dz, w: 1.5 * s, h: 0.14 * s, d: 0.16, yaw, kind: KIND.wood, color: C.woodDark });
    const [kx, kz] = ax(-w * 0.18 + 0.4 * s, d / 2 + 0.1);
    addBlob(props, { x: kx, y: y + 0.6 * s + 1.1 * s, z: kz, rx: 0.07, ry: 0.07, rz: 0.07, rings: 3, seg: 5, kind: KIND.gold, color: C.gold });
    const [px, pz] = ax(-w * 0.18, d / 2 + 0.55 * s);
    addBox(props, { x: px, y: y + 0.12, z: pz, w: 1.8 * s, h: 0.24, d: 1.0 * s, yaw, kind: KIND.stone, color: C.stoneDark, colorTop: C.stone });
    for (const wx of [w * 0.22, w * 0.36]) {
      const [gx, gz] = ax(wx, d / 2 + 0.02);
      addBox(props, { x: gx, y: y + 0.6 * s + 1.7 * s, z: gz, w: 0.95 * s, h: 1.05 * s, d: 0.1, yaw, kind: KIND.glass, color: lin("#25404a") });
      addBox(props, { x: gx, y: y + 0.6 * s + 1.7 * s, z: gz + 0.01, w: 1.1 * s, h: 0.1, d: 0.14, yaw, kind: KIND.wood, color: C.woodDark });
      addBox(props, { x: gx, y: y + 0.6 * s + 1.7 * s, z: gz + 0.01, w: 0.08, h: 1.2 * s, d: 0.14, yaw, kind: KIND.wood, color: C.woodDark });
      const [fx, fz] = ax(wx, d / 2 + 0.2);
      addBox(props, { x: fx, y: y + 0.6 * s + 1.05 * s, z: fz, w: 1.15 * s, h: 0.28 * s, d: 0.34, yaw, kind: KIND.wood, color: C.wood });
      for (let k = 0; k < 4; k++) {
        const [bx, bz] = ax(wx - 0.42 * s + k * 0.28 * s, d / 2 + 0.2);
        addBlob(props, { x: bx, y: y + 0.6 * s + 1.26 * s, z: bz, rx: 0.17, ry: 0.15, rz: 0.15, rings: 3, seg: 6, kind: KIND.leaf, color: k % 2 ? lin("#e8667f") : lin("#f1d34a"), colorTop: k % 2 ? lin("#f6a0b6") : lin("#fff08a"), rand });
      }
    }
    for (let i = 0; i < 9; i++) {
      const [vx, vz] = ax(w / 2 - 0.1 - rand() * 0.9, d / 2 + 0.12);
      addBlob(props, { x: vx, y: y + 0.6 * s + 0.4 + i * 0.42 * s * (0.6 + rand() * 0.5), z: vz, rx: 0.34 * s, ry: 0.3 * s, rz: 0.2 * s, rings: 3, seg: 6, bump: 0.25, kind: KIND.leaf, color: lin("#2f6a2a"), colorTop: lin("#6fa83c"), rand, upNormal: 0.2 });
    }
    blobs.push({ x: x + SUN_SHADOW.x * 4.2, z: z + SUN_SHADOW.z * 3.2, rx: w * 0.78, rz: d * 0.78, strength: 0.5 });
    blobs.push({ x, z, rx: w * 0.62, rz: d * 0.62, strength: 0.35 });
    keepClear.push({ x, z, r: Math.max(w, d) * 0.62 + 1.5 });
  };
  const cot = STRUCTURES.cottage, dcot = STRUCTURES.distantCottage, mill = STRUCTURES.windmill;
  cottage(cot.x, cot.z, 1.12, 0, C.tile, C.plaster);
  cottage(dcot.x, dcot.z, 0.95, 0.5, lin("#a8503a"), lin("#e6dcc0"));
  if (replace.shrubs) {
    for (const c of placements.cottages) {
      for (let i = 0; i < 5; i++) {
        const a = c.yaw + 0.5 + i * 1.15, r = (c.w ?? 7) * 0.62 + 0.8 + (i % 2) * 0.9;
        const sx = c.x + Math.cos(a) * r, sz = c.z + Math.sin(a) * r * 0.8;
        placements.shrubs.push({ x: sx, y: terrainHeight(sx, sz) - 0.05, z: sz, s: 0.9 + (i % 3) * 0.25, yaw: i * 1.7 });
      }
    }
  }

  // windmill: stone base, tapered wooden body with a gallery and stairs, shingled cap, cloth sails
  const my = terrainHeight(mill.x, mill.z) - 0.2;
  addLathe(props, { x: mill.x, y: my, z: mill.z, profile: [[4.1, 0], [3.9, 2.3], [3.65, 4.5]], seg: 20, kind: KIND.stone, color: C.stoneDark, colorTop: C.stone });
  addLathe(props, { x: mill.x, y: my, z: mill.z, profile: [[3.6, 4.4], [3.2, 8.2], [2.7, 12.2], [2.45, 13.8]], seg: 20, kind: KIND.wood, color: lin("#6f4f32"), colorTop: lin("#9c7448") });
  for (const by3 of [7.4, 10.6]) addLathe(props, { x: mill.x, y: my, z: mill.z, profile: [[3.34 - (by3 - 7.4) * 0.12, by3], [3.42 - (by3 - 7.4) * 0.12, by3 + 0.05], [3.42 - (by3 - 7.4) * 0.12, by3 + 0.22], [3.34 - (by3 - 7.4) * 0.12, by3 + 0.27]], seg: 20, kind: KIND.wood, color: C.woodDark });
  addLathe(props, { x: mill.x, y: my, z: mill.z, profile: [[4.7, 4.5], [4.7, 4.72], [3.4, 4.72]], seg: 20, kind: KIND.deck, color: C.woodLight });
  for (let i = 0; i < 18; i++) {
    const a2 = (i / 18) * Math.PI * 2;
    addCylinder(props, { x: mill.x + Math.cos(a2) * 4.6, y: my + 4.72, z: mill.z + Math.sin(a2) * 4.6, r0: 0.06, r1: 0.06, h: 1.0, seg: 5, kind: KIND.wood, color: C.woodDark });
  }
  addLathe(props, { x: mill.x, y: my, z: mill.z, profile: [[4.6, 5.65], [4.72, 5.65], [4.72, 5.78], [4.6, 5.78]], seg: 20, kind: KIND.wood, color: C.woodLight });
  for (let i = 0; i < 8; i++) {
    addBox(props, { x: mill.x + 4.4 + i * 0.42, y: my + 4.42 - i * 0.56, z: mill.z + 1.9, w: 0.6, h: 0.12, d: 1.15, kind: KIND.wood, color: C.woodLight });
    if (i % 2 === 0) addCylinder(props, { x: mill.x + 4.4 + i * 0.42, y: my - 0.1, z: mill.z + 2.45, r0: 0.05, r1: 0.05, h: 4.5 - i * 0.56 + 0.7, seg: 5, kind: KIND.wood, color: C.woodDark });
  }
  addBox(props, { x: mill.x, y: my + 1.45, z: mill.z + 3.82, w: 1.9, h: 2.9, d: 0.3, kind: KIND.wood, color: C.woodDark, colorTop: C.barkLight });
  addBox(props, { x: mill.x, y: my + 3.0, z: mill.z + 3.72, w: 2.3, h: 0.28, d: 0.3, kind: KIND.stone, color: C.stoneDark });
  for (const [wy, ww] of [[7.0, 1.0], [9.4, 0.9], [11.8, 0.8]] as const) {
    const rr = 3.6 - (wy - 4.4) * 0.12 - 0.1;
    addBox(props, { x: mill.x, y: my + wy, z: mill.z + rr, w: ww, h: ww * 1.3, d: 0.25, kind: KIND.glass, color: lin("#25404a") });
    addBox(props, { x: mill.x, y: my + wy, z: mill.z + rr + 0.05, w: ww + 0.3, h: 0.12, d: 0.18, kind: KIND.wood, color: C.woodDark });
    addBox(props, { x: mill.x, y: my + wy, z: mill.z + rr + 0.05, w: 0.1, h: ww * 1.5, d: 0.18, kind: KIND.wood, color: C.woodDark });
  }
  addLathe(props, { x: mill.x, y: my, z: mill.z, profile: [[2.6, 13.7], [3.05, 14.0], [2.55, 15.3], [1.35, 16.6], [0.35, 17.5], [0.0, 17.8]], seg: 20, kind: KIND.roof, color: lin("#4d3626"), colorTop: lin("#7b5638") });
  addBlob(props, { x: mill.x, y: my + 17.9, z: mill.z, rx: 0.26, ry: 0.26, rz: 0.26, rings: 4, seg: 6, kind: KIND.gold, color: C.gold });
  addBox(props, { x: mill.x, y: my + 14.7, z: mill.z + 2.35, w: 0.7, h: 0.7, d: 1.3, kind: KIND.wood, color: C.woodDark });
  for (let i = 0; i < 7; i++) blobs.push({ x: mill.x + SUN_SHADOW.x * (3 + i * 3.0), z: mill.z + SUN_SHADOW.z * (3 + i * 3.0), rx: 3.8 - i * 0.2, rz: 3.4 - i * 0.2, strength: 0.4 - i * 0.04 });
  blobs.push({ x: mill.x, z: mill.z, rx: 5, rz: 5, strength: 0.4 });
  keepClear.push({ x: mill.x, z: mill.z, r: 7 });
  const windmillHub = { x: mill.x, y: my + 14.7, z: mill.z + 3.15 };

  /* ---------- fences, signs, the bell frame ---------- */
  const fenceAt = (x: number, z: number, scale: number): void => {
    const y = terrainHeight(x, z);
    const w = scale * FENCE_ASPECT;
    for (const ry of [0.75, 0.42]) addBox(props, { x, y: y + ry, z, w: w * 1.02, h: 0.12, d: 0.08, kind: KIND.wood, color: C.wood, jitter: 0.08, rand });
    const pickets = Math.round(w / 0.32);
    for (let i = 0; i <= pickets; i++) {
      const px = x - w / 2 + (i / pickets) * w;
      addBox(props, { x: px, y: y + 0.5 + (i % 2) * 0.03, z, w: 0.12, h: 0.98, d: 0.05, kind: KIND.wood, color: C.woodLight, colorTop: scaleRgb(C.woodLight, 1.1), jitter: 0.08, rand });
    }
    for (const dx of [-0.5, 0.5]) addBox(props, { x: x + dx * w, y: y + 0.5, z, w: 0.16, h: 1.1, d: 0.16, kind: KIND.wood, color: C.woodDark });
    keepClear.push({ x, z, r: 1.1 });
  };
  for (let x = -18; x < -7; x += 4) fenceAt(x, -4, 1.45);
  for (let x = 25; x < 42; x += 4) fenceAt(x, 7, 1.35);
  for (const [sx, sz, yaw] of [[-14, 2, 0.2], [13, 3, -0.15]] as const) {
    const y = terrainHeight(sx, sz);
    addBox(props, { x: sx, y: y + 0.75, z: sz, w: 0.16, h: 1.5, d: 0.16, kind: KIND.wood, color: C.woodDark });
    addBox(props, { x: sx, y: y + 1.45, z: sz + 0.05, w: 1.05, h: 0.46, d: 0.07, yaw, kind: KIND.wood, color: C.woodLight });
    addBox(props, { x: sx + 0.1, y: y + 1.0, z: sz + 0.05, w: 0.8, h: 0.3, d: 0.07, yaw: yaw + 0.1, kind: KIND.wood, color: C.wood });
    keepClear.push({ x: sx, z: sz, r: 1.2 });
  }
  const by = terrainHeight(BELL.x, BELL.z);
  if (!replace.bell) {
  for (const sx of [-1.15, 1.15]) {
    addCylinder(props, { x: BELL.x + sx, y: by - 0.1, z: BELL.z, r0: 0.17, r1: 0.14, h: 3.5, seg: 8, kind: KIND.bark, color: C.barkDark, colorTop: C.barkLight });
    addBox(props, { x: BELL.x + sx * 0.78, y: by + 2.55, z: BELL.z, w: 0.12, h: 0.12, d: 0.12, yaw: 0, kind: KIND.wood, color: C.woodDark, tiltZ: sx > 0 ? 0.8 : -0.8 });
  }
  addBox(props, { x: BELL.x, y: by + 3.45, z: BELL.z, w: 2.9, h: 0.22, d: 0.26, kind: KIND.wood, color: C.woodDark, colorTop: C.wood });
  addGable(props, { x: BELL.x, y: by + 3.55, z: BELL.z, w: 3.0, d: 1.5, h: 0.9, overhang: 0.25, kind: KIND.roof, color: C.shingle, colorTop: lin("#9b6a4a"), gableColor: C.wood, gableKind: KIND.wood });
  addBox(props, { x: BELL.x, y: by + 0.2, z: BELL.z + 1.6, w: 2.0, h: 0.1, d: 0.6, kind: KIND.deck, color: C.woodLight });
  for (const bx of [-0.8, 0.8]) addBox(props, { x: BELL.x + bx, y: by + 0.08, z: BELL.z + 1.6, w: 0.12, h: 0.2, d: 0.5, kind: KIND.wood, color: C.woodDark });
  }
  if (replace.bell) placements.bell.push({ x: BELL.x, y: by - 0.05, z: BELL.z, s: 1, yaw: 0, h: 4.6 });
  keepClear.push({ x: BELL.x, z: BELL.z, r: 3.2 });
  blobs.push({ x: BELL.x + 1.2, z: BELL.z - 0.8, rx: 2.4, rz: 1.4, strength: 0.32 });
  const bellHang = { x: BELL.x, y: by + 3.3, z: BELL.z };

  /* ---------- the jetty and the moored boat ---------- */
  const jx = 31;
  const deckY = SEA_LEVEL + 0.82;
  for (let i = 0; i < 14; i++) {
    const z = -9.5 - 0.58 * i;
    addBox(props, { x: jx, y: deckY, z, w: 2.9, h: 0.14, d: 0.53, kind: KIND.deck, color: i % 2 ? lin("#b0905e") : lin("#98794c"), jitter: 0.05, rand });
  }
  for (const sx of [-1.25, 1.25]) addBox(props, { x: jx + sx, y: deckY - 0.18, z: -13.4, w: 0.16, h: 0.2, d: 8.4, kind: KIND.wood, color: C.woodDark });
  for (let i = 0; i < 6; i++) {
    for (const sx of [-1.28, 1.28]) {
      const z = -10.4 - i * 1.5;
      addCylinder(props, { x: jx + sx, y: SEA_LEVEL - 1.3, z, r0: 0.17, r1: 0.14, h: 2.55 + (i % 2) * 0.12, seg: 7, kind: KIND.bark, color: C.barkDark, colorTop: C.barkLight });
      if (i % 2 === 0) {
        addCylinder(props, { x: jx + sx, y: deckY, z, r0: 0.09, r1: 0.08, h: 0.95, seg: 6, kind: KIND.wood, color: C.woodDark });
      }
    }
  }
  for (const sx of [-1.28, 1.28]) addBox(props, { x: jx + sx, y: deckY + 0.9, z: -13.4, w: 0.07, h: 0.07, d: 8.5, kind: KIND.wood, color: C.woodLight });
  const jettyEnd = { x: jx, y: deckY, z: -17.2 };
  addCylinder(props, { x: jx, y: deckY, z: -17.4, r0: 0.1, r1: 0.1, h: 2.1, seg: 6, kind: KIND.wood, color: C.woodDark });
  addBox(props, { x: jx, y: deckY + 2.2, z: -17.4, w: 0.42, h: 0.34, d: 0.42, kind: KIND.glass, color: lin("#403015") });
  lanterns.push({ x: jx, y: deckY + 2.2, z: -17.4 });
  keepClear.push({ x: jx, z: -13, r: 4.6 });
  // shoreline reeds anchor + rocks
  const rocks = (x: number, z: number, n: number, s: number): void => {
    for (let i = 0; i < n; i++) {
      const rx = x + (rand() - 0.5) * 3.2 * s, rz = z + (rand() - 0.5) * 2.6 * s;
      const sz = (0.4 + rand() * 0.9) * s;
      addBlob(props, { x: rx, y: terrainHeight(rx, rz) + sz * 0.2, z: rz, rx: sz * 1.3, ry: sz * 0.8, rz: sz, rings: 4, seg: 7, bump: 0.22, kind: KIND.stone, color: scaleRgb(C.rock, 0.78), colorTop: C.rock, rand, upNormal: 0.15 });
    }
  };
  rocks(-30, -7.2, 4, 0.9); rocks(-10, -7.5, 3, 0.8); rocks(12, -4.2, 3, 0.8); rocks(40, -12.5, 6, 1.0); rocks(8, -15.5, 5, 1.1); rocks(-35, -14, 7, 1.2); rocks(52, 8, 4, 0.9); rocks(-43, -8, 4, 1.0); rocks(24, -2, 3, 0.7);
  if (replace.stones) {
    for (const [sx, sz, ss, yaw] of [[-35, -14, 1.0, 0.3], [40, -12.5, 0.9, -0.6]] as const) {
      placements.stones.push({ x: sx, y: terrainHeight(sx, sz) - 0.05, z: sz, s: ss, yaw });
      keepClear.push({ x: sx, z: sz, r: 3.2 * ss });
    }
  }

  // boat: its own mesh, origin at the waterline, bow towards +z
  const boat = newMesh();
  addBlob(boat, { x: 0, y: 0.18, z: 0, rx: 0.95, ry: 0.55, rz: 2.7, rings: 7, seg: 12, bump: 0.0, upNormal: 0.0, kind: KIND.paint, color: scaleRgb(C.hull, 0.8), colorTop: C.hull });
  addBox(boat, { x: 0, y: 0.52, z: 0, w: 1.3, h: 0.08, d: 4.5, kind: KIND.deck, color: C.woodLight });
  for (const sx of [-1, 1]) addBox(boat, { x: sx * 0.9, y: 0.6, z: 0, w: 0.08, h: 0.12, d: 4.7, kind: KIND.paint, color: C.hullTrim });
  addCylinder(boat, { x: 0, y: 0.55, z: 0.5, r0: 0.1, r1: 0.07, h: 4.2, seg: 7, kind: KIND.bark, color: C.barkDark, colorTop: C.barkLight });
  addQuad(boat, { p: [[0, 1.0, 0.55], [0, 1.0, -1.7], [0, 4.4, 0.25], [0, 4.4, 0.55]].map((p) => p as [number, number, number]) as unknown as [[number, number, number], [number, number, number], [number, number, number], [number, number, number]], kind: KIND.cloth, color: C.cloth, colorTop: lin("#fffaf0") });
  addBox(boat, { x: 0, y: 0.8, z: -1.9, w: 0.1, h: 0.5, d: 0.5, kind: KIND.wood, color: C.woodDark });
  const boatMoor = { x: jx + 2.35, y: SEA_LEVEL + 0.02, z: -14.3 };

  /* ---------- trees ---------- */
  const pine = (x: number, z: number, s: number, tone: number, yAt?: number): void => {
    const y = (yAt ?? terrainHeight(x, z)) - 0.1;
    const H = (3.8 + rand() * 2.8) * s;
    const phase = rand() * 6.28;
    const frost = rand() < 0.22;
    if (replace.trees) {
      placements.pines.push({ x, y, z, s, yaw: rand() * 6.28, h: H + 1.2 * s, variant: frost ? 1 : 0 });
      blobs.push({ x: x + SUN_SHADOW.x * H * 0.55, z: z + SUN_SHADOW.z * H * 0.55, rx: 1.7 * s, rz: 1.5 * s + H * 0.12, strength: 0.38 });
      keepClear.push({ x, z, r: 1.3 * s });
      treeCount++;
      return;
    }
    const deep = frost ? C.pineFrost : mixRgb(C.pineDeep, C.pineMid, tone);
    const top = frost ? scaleRgb(C.pineFrost, 1.25) : mixRgb(C.pineMid, C.pineLight, tone);
    addCylinder(props, { x, y, z, r0: 0.3 * s, r1: 0.15 * s, h: 2.3 * s, seg: 6, kind: KIND.bark, color: C.barkDark, colorTop: C.barkLight, sway: 0.02, phase });
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const f = i / tiers;
      const base = y + 1.2 * s + f * (H - 2.0 * s);
      const r = (1.7 * (1 - f * 0.78)) * s;
      const h = ((H - 1.2 * s) / tiers) * 2.15;
      addCylinder(props, { x, y: base, z, r0: r, r1: 0.04 * s, h, seg: 11, jag: 0.16, kind: KIND.leaf, color: scaleRgb(deep, 0.78 + 0.1 * f), colorTop: mixRgb(deep, top, 0.4 + 0.6 * f), jitter: 0.07, rand, sway: 0.1 * f * s + 0.03, phase, upNormal: 0.55 });
    }
    blobs.push({ x: x + SUN_SHADOW.x * H * 0.55, z: z + SUN_SHADOW.z * H * 0.55, rx: 1.7 * s, rz: 1.5 * s + H * 0.12, strength: 0.38 });
    keepClear.push({ x, z, r: 1.3 * s });
    treeCount++;
  };
  const roundTree = (x: number, z: number, s: number, variant: "oak" | "birch" | "maple", big = false, yAt?: number): void => {
    const y = (yAt ?? terrainHeight(x, z)) - 0.1;
    const phase = rand() * 6.28;
    const trunkH = (big ? 4.4 : 2.0 + rand() * 0.6) * s;
    if (replace.trees) {
      const R0 = (big ? 3.1 : 1.5 + rand() * 0.4) * s;
      placements.oaks.push({ x, y, z, s, yaw: rand() * 6.28, h: trunkH + R0 * 2.2, variant: variant === "birch" ? 1 : variant === "maple" ? 2 : 0 });
      blobs.push({ x: x + SUN_SHADOW.x * R0 * 1.0, z: z + SUN_SHADOW.z * R0 * 1.0, rx: R0 * 1.5, rz: R0 * 1.3, strength: big ? 0.5 : 0.36 });
      keepClear.push({ x, z, r: big ? 2.6 : 1.3 * s });
      treeCount++;
      return;
    }
    const leafBase = variant === "maple" ? lin("#a8903a") : variant === "birch" ? lin("#5e9a3e") : C.oakDeep;
    const leafTop = variant === "maple" ? lin("#dcc45a") : variant === "birch" ? lin("#93c455") : lin("#78ad42");
    addCylinder(props, { x, y, z, r0: (big ? 0.85 : 0.34) * s, r1: (big ? 0.5 : 0.2) * s, h: trunkH, seg: 8, kind: KIND.bark, color: variant === "birch" ? C.birchDark : C.barkDark, colorTop: variant === "birch" ? C.birch : C.barkLight, sway: 0.015, phase });
    const nb = big ? 16 : 9 + Math.floor(rand() * 4);
    const R = (big ? 3.1 : 1.5 + rand() * 0.4) * s;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 * 1.7 + rand();
      const rr = i === 0 ? 0 : R * (0.5 + rand() * 0.45);
      const by2 = y + trunkH + R * (0.45 + rand() * 0.75) + (i === 0 ? R * 0.35 : 0);
      const sc = (i === 0 ? 0.8 : 0.42 + rand() * 0.28) * R;
      addBlob(props, { x: x + Math.cos(a) * rr, y: by2, z: z + Math.sin(a) * rr, rx: sc, ry: sc * 0.8, rz: sc, rings: 5, seg: 9, bump: 0.2, kind: KIND.leaf, color: leafBase, colorTop: leafTop, jitter: 0.1, rand, sway: 0.1 * s, phase: phase + i * 0.4, upNormal: 0.45 });
    }
    if (big) {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.4;
        addCylinder(props, { x, y: y + trunkH * 0.7, z, r0: 0.3, r1: 0.14, h: 2.4, seg: 6, kind: KIND.bark, color: C.barkDark, colorTop: C.barkLight, lean: [Math.cos(a) * 1.9, 1.1, Math.sin(a) * 1.9] });
      }
    }
    blobs.push({ x: x + SUN_SHADOW.x * R * 1.0, z: z + SUN_SHADOW.z * R * 1.0, rx: R * 1.5, rz: R * 1.3, strength: big ? 0.5 : 0.36 });
    keepClear.push({ x, z, r: big ? 2.6 : 1.3 * s });
    treeCount++;
  };

  // the old oak at the first letter: a wide, gnarled crown on a short, thick trunk
  {
    const ox = -25, oz = 0, oy = terrainHeight(ox, oz) - 0.2;
    addLathe(props, { x: ox, y: oy, z: oz, profile: [[2.6, 0], [1.9, 0.7], [1.45, 2.2], [1.2, 4.6], [1.0, 6.0]], seg: 14, kind: KIND.bark, color: C.barkDark, colorTop: C.barkLight });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.3;
      addCylinder(props, { x: ox, y: oy + 4.8, z: oz, r0: 0.62, r1: 0.26, h: 3.0, seg: 7, kind: KIND.bark, color: C.barkDark, colorTop: C.barkLight, lean: [Math.cos(a) * 4.2, 2.6, Math.sin(a) * 4.2] });
    }
    const phase = rand() * 6.28;
    for (let i = 0; i < 110; i++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 7.0;
      const dome = Math.sqrt(Math.max(0, 1 - (rr / 7.4) ** 2));
      const h = 7.6 + dome * 5.6 + rand() * 1.8;
      const r = 1.1 + rand() * 1.1;
      addBlob(props, { x: ox + Math.cos(a) * rr, y: oy + h, z: oz + Math.sin(a) * rr * 0.9, rx: r, ry: r * 0.8, rz: r, rings: 5, seg: 8, bump: 0.25, kind: KIND.leaf, color: lin("#2a5421"), colorTop: lin("#b0c63e"), jitter: 0.14, rand, sway: 0.08, phase: phase + i * 0.3, upNormal: 0.5 });
    }
    blobs.push({ x: ox + SUN_SHADOW.x * 7, z: oz + SUN_SHADOW.z * 7, rx: 9.5, rz: 8, strength: 0.52 });
    keepClear.push({ x: ox, z: oz, r: 5.2 });
    treeCount++;
  }
  for (const l of LETTERS) keepClear.push({ x: l.x, z: l.z, r: 2.4 });

  const inBounds = (x: number, z: number): boolean => x > BOUNDS.minX - 4 && x < BOUNDS.maxX + 4 && z > BOUNDS.minZ - 2 && z < BOUNDS.maxZ + 6;
  const tryPlace = (count: number, region: { x0: number; x1: number; z0: number; z1: number }, fn: (x: number, z: number) => void, pad = 1.2): void => {
    let made = 0, tries = 0;
    while (made < count && tries++ < count * 25) {
      const x = region.x0 + rand() * (region.x1 - region.x0), z = region.z0 + rand() * (region.z1 - region.z0);
      if (blocked(x, z, pad)) continue;
      if (terrainHeight(x, z) < SEA_LEVEL + 0.5) continue;
      fn(x, z);
      made++;
    }
  };
  // west and east hill forests, a few scattered meadow trees; nothing tall between the start and the lens
  tryPlace(60, { x0: -58, x1: -32, z0: -12, z1: 5 }, (x, z) => (rand() < 0.8 ? pine(x, z, 0.85 + rand() * 0.5, rand()) : roundTree(x, z, 0.85 + rand() * 0.35, rand() < 0.5 ? "birch" : "oak")));
  tryPlace(44, { x0: 38, x1: 58, z0: -10, z1: 4 }, (x, z) => (rand() < 0.7 ? pine(x, z, 0.8 + rand() * 0.5, rand()) : roundTree(x, z, 0.85 + rand() * 0.35, rand() < 0.4 ? "maple" : "birch")));
  tryPlace(10, { x0: -58, x1: -48, z0: 5, z1: 22 }, (x, z) => pine(x, z, 0.6 + rand() * 0.25, rand()));
  tryPlace(10, { x0: 52, x1: 58, z0: 4, z1: 22 }, (x, z) => pine(x, z, 0.6 + rand() * 0.25, rand()));
  tryPlace(34, { x0: -32, x1: 38, z0: -12, z1: 3 }, (x, z) => (rand() < 0.5 ? pine(x, z, 0.65 + rand() * 0.35, rand()) : roundTree(x, z, 0.7 + rand() * 0.3, rand() < 0.35 ? "maple" : rand() < 0.5 ? "birch" : "oak")), 3.2);
  // ridges beyond the walkable box: a dense, cheap treeline that climbs the hills
  let ridge = 0, tries = 0;
  while (ridge < 150 && tries++ < 3000) {
    const x = -94 + rand() * 190, z = -20 + rand() * 78;
    if (inBounds(x, z) || terrainHeight(x, z) < 1.2) continue;
    pine(x, z, 1.3 + rand() * 1.2, rand());
    ridge++;
  }

  /* ---------- the far island ---------- */
  const island = (cx: number, cz: number, s: number): void => {
    const iy = SEA_LEVEL;
    addBlob(props, { x: cx, y: iy + 0.2, z: cz, rx: 26 * s, ry: 3.2 * s, rz: 15 * s, rings: 6, seg: 20, bump: 0.12, kind: KIND.paint, color: lin("#cdbf8c"), colorTop: lin("#7fa045"), rand, upNormal: 0.0 });
    addBlob(props, { x: cx - 6 * s, y: iy + 2.2 * s, z: cz - 1, rx: 13 * s, ry: 4.2 * s, rz: 9 * s, rings: 6, seg: 16, bump: 0.1, kind: KIND.paint, color: lin("#6f9a3e"), colorTop: lin("#9bc255"), rand, upNormal: 0.1 });
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 14 * s;
      const x = cx + Math.cos(a) * r * 1.5 - 4 * s, z = cz + Math.sin(a) * r * 0.8;
      const ph = rand() * 6;
      const H = (6 + rand() * 4) * s;
      addCylinder(props, { x, y: iy + 2.4 * s, z, r0: 0.3 * s, r1: 0.18 * s, h: 2.2, seg: 5, kind: KIND.bark, color: C.barkDark });
      for (let t = 0; t < 4; t++) {
        const f = t / 4;
        addCylinder(props, { x, y: iy + 3.4 * s + f * (H - 3 * s), z, r0: 1.9 * s * (1 - f * 0.75), r1: 0.05, h: (H / 4) * 2.1, seg: 8, jag: 0.14, kind: KIND.leaf, color: scaleRgb(C.pineMid, 0.8), colorTop: C.pineLight, rand, phase: ph, upNormal: 0.5 });
      }
    }
    // a small lighthouse on the isle
    const lx = cx + 11 * s, lz = cz + 1;
    addLathe(props, { x: lx, y: iy + 1.6 * s, z: lz, profile: [[1.9 * s, 0], [1.3 * s, 8 * s], [1.15 * s, 9.5 * s]], seg: 12, kind: KIND.plaster, color: lin("#efe6cf"), colorTop: lin("#ffffff") });
    addLathe(props, { x: lx, y: iy + 1.6 * s, z: lz, profile: [[1.2 * s, 9.5 * s], [1.6 * s, 9.9 * s], [1.6 * s, 10.3 * s], [0.0, 11.8 * s]], seg: 12, kind: KIND.roof, color: lin("#a8453a"), colorTop: lin("#c4573f") });
    addBox(props, { x: lx, y: iy + 1.6 * s + 10.0 * s, z: lz, w: 0.9 * s, h: 0.8 * s, d: 0.9 * s, kind: KIND.glass, color: lin("#403015") });
  };
  island(-34, -118, 1.0);
  // the far shore: low wooded hills across the water, then blue mountains
  for (let i = 0; i < 12; i++) {
    const x = -300 + i * 55 + rand() * 25, z = -118 - rand() * 30;
    const rx = 48 + rand() * 30, ry = 4 + rand() * 4;
    addBlob(props, { x, y: SEA_LEVEL + 0.5, z, rx, ry, rz: 22 + rand() * 12, rings: 5, seg: 14, bump: 0.12, kind: KIND.paint, color: lin("#3f7234"), colorTop: lin("#6e9f40"), rand, upNormal: 0.1 });
    const n = 40 + Math.floor(rand() * 20);
    for (let k = 0; k < n; k++) {
      const px = x + (rand() * 2 - 1) * rx * 0.85, pz = z + (rand() * 2 - 1) * 18;
      const f = 1 - Math.hypot((px - x) / rx, (pz - z) / 20);
      if (f < 0.15) continue;
      const py = SEA_LEVEL + 0.5 + ry * Math.sqrt(Math.max(0, f)) * 0.9;
      if (rand() < 0.75) pine(px, pz, 1.1 + rand() * 0.8, rand(), py);
      else roundTree(px, pz, 1.4 + rand() * 0.7, rand() < 0.5 ? "oak" : "birch", false, py);
    }
  }
  for (let i = 0; i < 8; i++) {
    const x = -330 + i * 95 + rand() * 30;
    addBlob(props, { x, y: SEA_LEVEL + 2, z: -300 - rand() * 40, rx: 110 + rand() * 40, ry: 14 + rand() * 12, rz: 50, rings: 6, seg: 16, bump: 0.16, kind: KIND.paint, color: lin("#4e7a74"), colorTop: lin("#8fb4b0"), rand, upNormal: 0.0 });
  }

  /* ---------- the animated pieces, each authored about its own origin ---------- */
  const sails = newMesh();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const R = (lx: number, ly: number, lz = 0): [number, number, number] => [lx * ca - ly * sa, lx * sa + ly * ca, lz];
    const spar = (x0: number, y0: number, x1: number, y1: number, w: number, z = 0): void => {
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len * w / 2, ny = dx / len * w / 2;
      addQuad(sails, { p: [R(x0 - nx, y0 - ny, z), R(x1 - nx, y1 - ny, z), R(x1 + nx, y1 + ny, z), R(x0 + nx, y0 + ny, z)], kind: KIND.wood, color: C.woodDark });
      addQuad(sails, { p: [R(x0 + nx, y0 + ny, z - 0.06), R(x1 + nx, y1 + ny, z - 0.06), R(x1 - nx, y1 - ny, z - 0.06), R(x0 - nx, y0 - ny, z - 0.06)], kind: KIND.wood, color: C.woodDark });
    };
    spar(0.5, 0, 11.0, 0, 0.34, 0.05);
    spar(2.6, 0.35, 10.8, 0.35, 0.16, 0.04);
    spar(2.6, 2.9, 10.8, 2.9, 0.16, 0.04);
    spar(2.6, 0.35, 2.6, 2.9, 0.16, 0.04);
    spar(10.8, 0.35, 10.8, 2.9, 0.16, 0.04);
    addQuad(sails, { p: [R(2.75, 0.4, 0.02), R(10.7, 0.4, 0.02), R(10.7, 2.85, 0.02), R(2.75, 2.85, 0.02)], kind: KIND.cloth, color: lin("#e2d3a8"), colorTop: lin("#f6ecce") });
    addQuad(sails, { p: [R(10.7, 0.4, 0.0), R(2.75, 0.4, 0.0), R(2.75, 2.85, 0.0), R(10.7, 2.85, 0.0)], kind: KIND.cloth, color: lin("#d6c79a"), colorTop: lin("#eadfba") });
    for (let k = 0; k < 5; k++) spar(2.6 + k * 2.05, 0.35, 2.6 + k * 2.05, 2.9, 0.08, 0.045);
  }
  addBlob(sails, { x: 0, y: 0, z: 0.1, rx: 0.55, ry: 0.55, rz: 0.55, rings: 5, seg: 8, kind: KIND.wood, color: C.woodDark, colorTop: C.wood });

  const bellMesh = newMesh();
  addLathe(bellMesh, { x: 0, y: -0.9, z: 0, profile: [[0.12, 0.85], [0.2, 0.78], [0.3, 0.62], [0.42, 0.34], [0.55, 0.06], [0.6, 0.0], [0.5, 0.0]], seg: 14, kind: KIND.gold, color: lin("#b9812a"), colorTop: lin("#f0c25a") });
  addBlob(bellMesh, { x: 0, y: -0.86, z: 0, rx: 0.1, ry: 0.1, rz: 0.1, rings: 3, seg: 6, kind: KIND.gold, color: lin("#6d4b1c") });
  addBox(bellMesh, { x: 0, y: 0, z: 0, w: 0.16, h: 0.12, d: 0.16, kind: KIND.wood, color: C.woodDark });

  const envelope = newMesh();
  addBox(envelope, { x: 0, y: 0, z: 0, w: 0.7, h: 0.46, d: 0.05, kind: KIND.cloth, color: lin("#efe3c0"), colorTop: lin("#fff6dc") });
  addQuad(envelope, { p: [[-0.35, 0.23, 0.03], [0.35, 0.23, 0.03], [0.0, -0.02, 0.03], [0.0, -0.02, 0.03]], kind: KIND.cloth, color: lin("#dcc99a"), colorTop: lin("#dcc99a") });
  addBlob(envelope, { x: 0, y: -0.02, z: 0.05, rx: 0.08, ry: 0.08, rz: 0.04, rings: 3, seg: 8, kind: KIND.paint, color: lin("#b8342c") });

  const wisp = newMesh();
  addBlob(wisp, { x: 0, y: 0, z: 0, rx: 0.2, ry: 0.24, rz: 0.2, rings: 5, seg: 8, bump: 0, kind: KIND.skin, color: lin("#9b6cf0"), colorTop: lin("#d9c4ff") });
  addBlob(wisp, { x: 0, y: -0.28, z: 0, rx: 0.1, ry: 0.2, rz: 0.1, rings: 3, seg: 6, bump: 0, kind: KIND.skin, color: lin("#7a4fd8"), colorTop: lin("#9b6cf0") });
  const traveller = buildTraveller();

  return { placements, props, sails, boat, traveller, bellMesh, envelope, wisp, blobs, keepClear, windmillHub, bellHang, boatMoor, jettyEnd, lanterns, chimney, treeCount };
}

/** The walker: limb ids drive the vertex-shader gait (1/2 legs, 3/4 arms, 5 cloak). Feet at y = 0, facing +z. */
function buildTraveller(): Mesh {
  const m = newMesh();
  const tunic = lin("#4f78a8"), tunicLight = lin("#6f9bc9"), skin = lin("#e9bf9a"), hat = lin("#c1432d"), hatLight = lin("#e1654a");
  const trousers = lin("#6b5a44"), boot = lin("#4a3524"), scarf = lin("#f2c14a"), cloak = lin("#8a4a2f"), pack = lin("#9a6d3f");
  for (const [limb, sx] of [[1, -0.12], [2, 0.12]] as const) {
    addCylinder(m, { x: sx, y: 0.2, z: 0, r0: 0.105, r1: 0.12, h: 0.7, seg: 7, kind: KIND.cloth, color: trousers, colorTop: scaleRgb(trousers, 1.15), limb });
    addCylinder(m, { x: sx, y: 0.0, z: 0.02, r0: 0.125, r1: 0.11, h: 0.28, seg: 7, kind: KIND.skin, color: boot, colorTop: scaleRgb(boot, 1.2), limb, cap: true });
    addBox(m, { x: sx, y: 0.06, z: 0.12, w: 0.2, h: 0.12, d: 0.24, kind: KIND.skin, color: boot, limb });
  }
  addCylinder(m, { x: 0, y: 0.82, z: 0, r0: 0.27, r1: 0.22, h: 0.68, seg: 10, kind: KIND.cloth, color: tunic, colorTop: tunicLight, cap: true });
  addCylinder(m, { x: 0, y: 0.84, z: 0, r0: 0.285, r1: 0.275, h: 0.1, seg: 10, kind: KIND.skin, color: lin("#6b4a2a") });
  addBlob(m, { x: 0, y: 1.5, z: 0, rx: 0.3, ry: 0.13, rz: 0.24, rings: 4, seg: 10, kind: KIND.cloth, color: tunicLight, bump: 0 });
  for (const [limb, sx] of [[3, -0.31], [4, 0.31]] as const) {
    addCylinder(m, { x: sx, y: 0.78, z: 0, r0: 0.075, r1: 0.09, h: 0.68, seg: 7, kind: KIND.cloth, color: tunic, colorTop: tunicLight, limb });
    addBlob(m, { x: sx, y: 0.74, z: 0, rx: 0.085, ry: 0.085, rz: 0.085, rings: 4, seg: 7, kind: KIND.skin, color: skin, limb, bump: 0 });
  }
  addCylinder(m, { x: 0, y: 1.46, z: 0, r0: 0.17, r1: 0.19, h: 0.12, seg: 9, kind: KIND.cloth, color: scarf, colorTop: scarf });
  addBlob(m, { x: 0.12, y: 1.4, z: 0.12, rx: 0.07, ry: 0.2, rz: 0.06, rings: 3, seg: 6, kind: KIND.cloth, color: scarf, bump: 0 });
  addBlob(m, { x: 0, y: 1.73, z: 0.01, rx: 0.23, ry: 0.24, rz: 0.23, rings: 6, seg: 10, kind: KIND.skin, color: scaleRgb(skin, 0.92), colorTop: skin, bump: 0 });
  addBlob(m, { x: -0.08, y: 1.74, z: 0.205, rx: 0.028, ry: 0.036, rz: 0.02, rings: 3, seg: 6, kind: KIND.paint, color: lin("#2a1c12"), bump: 0 });
  addBlob(m, { x: 0.08, y: 1.74, z: 0.205, rx: 0.028, ry: 0.036, rz: 0.02, rings: 3, seg: 6, kind: KIND.paint, color: lin("#2a1c12"), bump: 0 });
  addBlob(m, { x: 0, y: 1.67, z: 0.215, rx: 0.045, ry: 0.025, rz: 0.02, rings: 3, seg: 6, kind: KIND.paint, color: lin("#c97a62"), bump: 0 });
  addBlob(m, { x: 0, y: 1.78, z: -0.04, rx: 0.245, ry: 0.19, rz: 0.24, rings: 5, seg: 10, kind: KIND.cloth, color: lin("#5a3a22"), colorTop: lin("#7a5230"), bump: 0 });
  addCylinder(m, { x: 0, y: 1.9, z: 0, r0: 0.3, r1: 0.3, h: 0.05, seg: 12, kind: KIND.cloth, color: scaleRgb(hat, 0.8) });
  addCylinder(m, { x: 0, y: 1.93, z: 0, r0: 0.21, r1: 0.025, h: 0.52, seg: 10, kind: KIND.cloth, color: hat, colorTop: hatLight, lean: [0.0, 0.0, -0.2], cap: true });
  addBlob(m, { x: 0, y: 2.46, z: -0.2, rx: 0.045, ry: 0.045, rz: 0.045, rings: 3, seg: 6, kind: KIND.cloth, color: scarf, bump: 0 });
  addBox(m, { x: 0, y: 1.08, z: -0.26, w: 0.36, h: 0.46, d: 0.2, kind: KIND.wood, color: pack, colorTop: scaleRgb(pack, 1.15) });
  addCylinder(m, { x: 0, y: 1.34, z: -0.27, r0: 0.09, r1: 0.09, h: 0.4, seg: 7, kind: KIND.cloth, color: lin("#d6c28a"), lean: [0.0, 0.0, 0.0] });
  for (const sx of [-0.14, 0.14]) addQuad(m, { p: [[sx - 0.025, 1.45, 0.1], [sx + 0.025, 1.45, 0.1], [sx + 0.025, 0.95, -0.24], [sx - 0.025, 0.95, -0.24]], kind: KIND.wood, color: lin("#6b4a2a") });
  addQuad(m, { p: [[-0.3, 1.5, -0.2], [0.3, 1.5, -0.2], [0.34, 0.45, -0.34], [-0.34, 0.45, -0.34]], kind: KIND.cloth, color: lin("#6e3a24"), colorTop: cloak, limb: 5 });
  addQuad(m, { p: [[0.3, 1.5, -0.2], [-0.3, 1.5, -0.2], [-0.34, 0.45, -0.34], [0.34, 0.45, -0.34]], kind: KIND.cloth, color: lin("#6e3a24"), colorTop: cloak, limb: 5 });
  return m;
}
