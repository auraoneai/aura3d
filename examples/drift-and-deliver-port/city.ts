/**
 * Drift & Deliver port: the city's look as pure geometry and placement data.
 *
 * The simulation owns the footprints (`world.ts`: one box per slot, also the collision solids). This module
 * dresses those exact footprints: facade walls with metric UVs (one texture cell = one 3.2 m bay x 3.1 m floor),
 * a shopfront band, awnings, tiered crowns, cornices, roofs and rooftop clutter. Nothing here moves or enlarges a
 * footprint beyond a few centimetres of trim, so the collision data and the recorded replays are untouched.
 *
 * Street furniture (lamps, traffic lights, street trees, park trees) is deterministic placement data.
 */
import { BAY_M, CELLS, FLOOR_M, SHOP_H, rng, type FacadeKind } from "./textures";
import { blob, box, createMesh, hexRgb, mixRgb, orientedBox, prism, quad, scaleRgb, tri, triangleCount, type MeshData, type Rgb } from "./mesh";
import { PITCH, STREET_LINES, noise, type Block, type Building, type District } from "./world";
import type { Solid } from "./sim";

/** One chunk: the whole city is ~126k triangles, so merging by material (about ten draws) beats per-chunk culling. */
export const CHUNK_BLOCKS = 15;

/** Wall colours baked into the facade textures (one texture per kind and colour). */
export const WALLS: Record<FacadeKind, readonly string[]> = {
  tower: ["#e6d6b8", "#d8c4a0", "#e3d9c8"],
  apartment: ["#e9d2ae", "#dfb994", "#efe3c9"],
  brick: ["#c7704f", "#b4634a"]
};

export const facadeKey = (kind: FacadeKind, variant: number): string => `${kind}:${variant}`;

const AWNINGS = ["#2f6b4a", "#b23a3a", "#d6a63c", "#2f4a7a", "#e9e0c8", "#7a3f6b"];
const ROOFS = ["#4e4842", "#5a524a", "#46454b", "#5d4a40"];

export interface CityChunk {
  readonly key: string;
  /** `kind:variant` facade meshes, plus `shop` and `trim` (solid colours, baked to palette UVs later). */
  readonly meshes: Record<string, MeshData>;
}

export interface CityStats {
  buildings: number;
  triangles: number;
  byKind: Record<FacadeKind, number>;
  tallest: number;
  awnings: number;
  chunks: number;
}

export interface CityGeometry {
  readonly chunks: CityChunk[];
  readonly stats: CityStats;
}

export function facadeKindFor(district: District, r: number): FacadeKind {
  switch (district) {
    case "core":
      return r < 0.9 ? "tower" : "apartment";
    case "midtown":
      return r < 0.45 ? "tower" : r < 0.85 ? "apartment" : "brick";
    case "commerce":
      return r < 0.45 ? "brick" : r < 0.8 ? "apartment" : "tower";
    case "residential":
      return r < 0.55 ? "apartment" : "brick";
    default:
      return r < 0.5 ? "brick" : "apartment";
  }
}

/** Which block a building belongs to (blocks are centred on multiples of the pitch). */
export function blockOf(b: Pick<Building, "x" | "z">): { i: number; j: number } {
  return { i: Math.round(b.x / PITCH), j: Math.round(b.z / PITCH) };
}

/** Outward (street-facing) axis of a building: the larger offset from its block centre. */
export function facingOf(b: Pick<Building, "x" | "z">): { nx: number; nz: number } {
  const { i, j } = blockOf(b);
  const dx = b.x - i * PITCH;
  const dz = b.z - j * PITCH;
  return Math.abs(dz) > Math.abs(dx) ? { nx: 0, nz: Math.sign(dz) || 1 } : { nx: Math.sign(dx) || 1, nz: 0 };
}

interface TierSpec {
  scale: number;
  to: number;
}

export function tiersFor(district: District, floors: number): TierSpec[] {
  if (district === "core") return [{ scale: 1, to: 0.66 }, { scale: 0.84, to: 0.9 }, { scale: 0.62, to: 1 }];
  if (district === "midtown" && floors > 12) return [{ scale: 1, to: 0.78 }, { scale: 0.82, to: 1 }];
  return [{ scale: 1, to: 1 }];
}

/** A facade wall from `a` to `b` (bottom edge, left to right seen from outside) with cell-metric UVs. */
function wall(m: MeshData, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, tint: Rgb, bays: number, floors: number, u0: number, v0: number, cellsU = CELLS, cellsV = CELLS): void {
  const dx = bx - ax;
  const dz = bz - az;
  quad(m, [ax, y0, az], [dx, 0, dz], [0, y1 - y0, 0], tint, [u0, v0], [u0 + bays / cellsU, v0 + floors / cellsV]);
}

/** Four walls of a box (outward normals), sharing one tint. */
function walls(m: MeshData, cx: number, cz: number, hw: number, hd: number, y0: number, y1: number, tint: Rgb, bayM: number, floorM: number, ou: number, ov: number, cellsU = CELLS, cellsV = CELLS): void {
  const h = y1 - y0;
  const floors = Math.max(1, Math.round(h / floorM));
  const bz = Math.max(1, Math.round((2 * hw) / bayM));
  const bx = Math.max(1, Math.round((2 * hd) / bayM));
  wall(m, cx - hw, cz + hd, cx + hw, cz + hd, y0, y1, tint, bz, floors, ou, ov, cellsU, cellsV);
  wall(m, cx + hw, cz - hd, cx - hw, cz - hd, y0, y1, tint, bz, floors, ou + 0.125, ov, cellsU, cellsV);
  wall(m, cx + hw, cz + hd, cx + hw, cz - hd, y0, y1, tint, bx, floors, ou + 0.25, ov, cellsU, cellsV);
  wall(m, cx - hw, cz - hd, cx - hw, cz + hd, y0, y1, tint, bx, floors, ou + 0.375, ov, cellsU, cellsV);
}

function roofCap(trim: MeshData, cx: number, cz: number, hw: number, hd: number, y: number, rof: Rgb, lip: Rgb): void {
  box(trim, cx, y, cz, hw + 0.18, 0.34, hd + 0.18, { side: lip, top: rof });
}

function gable(trim: MeshData, cx: number, cz: number, hw: number, hd: number, y: number, roof: Rgb, wallTint: Rgb): void {
  const rise = Math.min(2.2, Math.min(hw, hd) * 0.8);
  const o = 0.25;
  if (hw >= hd) {
    quad(trim, [cx - hw - o, y, cz + hd + o], [2 * hw + 2 * o, 0, 0], [0, rise, -(hd + o)], roof);
    quad(trim, [cx + hw + o, y, cz - hd - o], [-(2 * hw + 2 * o), 0, 0], [0, rise, hd + o], roof);
    tri(trim, [cx + hw, y, cz + hd], [cx + hw, y, cz - hd], [cx + hw, y + rise, cz], wallTint);
    tri(trim, [cx - hw, y, cz - hd], [cx - hw, y, cz + hd], [cx - hw, y + rise, cz], wallTint);
  } else {
    quad(trim, [cx + hw + o, y, cz + hd + o], [0, 0, -(2 * hd + 2 * o)], [-(hw + o), rise, 0], roof);
    quad(trim, [cx - hw - o, y, cz - hd - o], [0, 0, 2 * hd + 2 * o], [hw + o, rise, 0], roof);
    tri(trim, [cx - hw, y, cz + hd], [cx + hw, y, cz + hd], [cx, y + rise, cz + hd], wallTint);
    tri(trim, [cx + hw, y, cz - hd], [cx - hw, y, cz - hd], [cx, y + rise, cz - hd], wallTint);
  }
}

function awning(trim: MeshData, cx: number, cz: number, nx: number, nz: number, along: number, width: number, color: Rgb, hw: number, hd: number): void {
  // frame: tangent along the face, normal pointing to the street
  const tx = nz !== 0 ? 1 : 0;
  const tz = nz !== 0 ? 0 : 1;
  const faceOff = nz !== 0 ? hd : hw;
  const px = cx + nx * faceOff + tx * along;
  const pz = cz + nz * faceOff + tz * along;
  const y0 = 3.15;
  const y1 = 3.75;
  const out = 1.35;
  const hwid = width / 2;
  // sloped canopy: from the wall at y1 down to the lip at y0
  quad(trim, [px - tx * hwid, y1, pz - tz * hwid], [tx * width, 0, tz * width], [nx * out, y0 - y1, nz * out], color);
  // front flap
  const fx = px + nx * out;
  const fz = pz + nz * out;
  quad(trim, [fx - tx * hwid, y0, fz - tz * hwid], [tx * width, 0, tz * width], [0, -0.32, 0], scaleRgb(color, 0.8));
  // underside, darker
  quad(trim, [px + tx * hwid, y1, pz + tz * hwid], [-tx * width, 0, -tz * width], [nx * out, y0 - y1, nz * out], scaleRgb(color, 0.55));
}

interface BuildingOut {
  triangles: number;
  awnings: number;
  height: number;
}

function dressBuilding(chunk: CityChunk, b: Building, district: District, index: number): BuildingOut {
  const r = rng(0xc17 + index * 7919);
  const kind = facadeKindFor(district, r());
  const variant = (b.tone + Math.floor(r() * 3)) % WALLS[kind].length;
  const tint: Rgb = [1, 1, 1];
  const lip = mixRgb(hexRgb(WALLS[kind][variant] as string), [1, 1, 1], 0.45);
  const rof = hexRgb(ROOFS[Math.floor(r() * ROOFS.length)] as string);
  const shaftKey = facadeKey(kind, variant);
  const shaft = (chunk.meshes[shaftKey] ??= createMesh());
  const shop = chunk.meshes.shop as MeshData;
  const trim = chunk.meshes.trim as MeshData;
  const { nx, nz } = facingOf(b);
  const floorsTotal = Math.max(1, Math.round(b.height / FLOOR_M));
  const hasShop = b.height > SHOP_H + 2.5;
  const shopH = hasShop ? SHOP_H : 0;
  const before = triangleCount(shaft) + triangleCount(shop) + triangleCount(trim);
  let awnings = 0;

  const ou = Math.floor(r() * CELLS) / CELLS;
  const ov = Math.floor(r() * CELLS) / CELLS;
  if (hasShop) {
    const shopTint: Rgb = [1, 1, 1];
    const cu = Math.floor(r() * 4) / 4;
    walls(shop, b.x, b.z, b.hw, b.hd, 0, SHOP_H, shopTint, BAY_M, SHOP_H, cu, 0, 4, 1);
    // ledge over the shopfront
    box(trim, b.x, SHOP_H - 0.1, b.z, b.hw + 0.28, 0.4, b.hd + 0.28, { side: lip, top: mixRgb(lip, [0, 0, 0], 0.15) });
    // awnings over the street-facing bays
    const faceLen = nz !== 0 ? 2 * b.hw : 2 * b.hd;
    const bays = Math.max(1, Math.round(faceLen / BAY_M));
    const bayW = faceLen / bays;
    if (r() > 0.2) {
      const colorHex = AWNINGS[Math.floor(r() * AWNINGS.length)] as string;
      for (let k = 0; k < bays; k++) {
        if (bays > 2 && k % 2 === 1) continue;
        awning(trim, b.x, b.z, nx, nz, (k + 0.5) * bayW - faceLen / 2, bayW * 0.86, hexRgb(colorHex), b.hw, b.hd);
        awnings++;
      }
    }
  }

  const tiers = tiersFor(district, floorsTotal);
  let y = shopH;
  tiers.forEach((t, ti) => {
    const top = Math.max(y + FLOOR_M, b.height * t.to);
    const hw = b.hw * t.scale;
    const hd = b.hd * t.scale;
    walls(shaft, b.x, b.z, hw, hd, y, top, tint, BAY_M, FLOOR_M, ou, ov + ti * 0.25);
    // cornice
    box(trim, b.x, top - 0.12, b.z, hw + 0.22, 0.42, hd + 0.22, { side: lip, top: mixRgb(lip, [0, 0, 0], 0.2) });
    y = top;
  });
  const topTier = tiers[tiers.length - 1] as TierSpec;
  const thw = b.hw * topTier.scale;
  const thd = b.hd * topTier.scale;
  const gabled = district === "residential" || district === "outskirts";
  if (gabled && r() > 0.35) {
    gable(trim, b.x, b.z, thw, thd, y + 0.3, hexRgb(["#9a5a45", "#58606a", "#7b4e3a"][Math.floor(r() * 3)] as string), hexRgb(WALLS[kind][variant] as string));
  } else {
    roofCap(trim, b.x, b.z, thw, thd, y, rof, lip);
    const roofY = y + 0.34;
    const clutter = Math.floor(r() * 3) + (district === "core" ? 1 : 0);
    for (let k = 0; k < clutter; k++) {
      const cw = 0.8 + r() * 0.9;
      const ch = 0.9 + r() * 1.4;
      const px = b.x + (r() - 0.5) * Math.max(0.2, thw * 1.2);
      const pz = b.z + (r() - 0.5) * Math.max(0.2, thd * 1.2);
      box(trim, px, roofY, pz, cw, ch, cw * (0.7 + r() * 0.5), { side: hexRgb("#8d8a84"), top: hexRgb("#a9a69f") });
    }
    if (district !== "core" && thw > 3 && r() > 0.55) {
      const tx = b.x + (r() - 0.5) * thw * 0.8;
      const tz = b.z + (r() - 0.5) * thd * 0.8;
      const leg = hexRgb("#4a443d");
      for (const [lx, lz] of [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]] as const) box(trim, tx + lx, roofY, tz + lz, 0.08, 1.6, 0.08, { side: leg, top: leg });
      prism(trim, tx, roofY + 1.6, tz, 1.15, 2.1, 8, hexRgb("#8b6a4a"), hexRgb("#6c5239"));
    }
    if (b.height > 55 && r() > 0.35) box(trim, b.x + (r() - 0.5) * thw, roofY, b.z + (r() - 0.5) * thd, 0.22, 7 + r() * 9, 0.22, { side: hexRgb("#5b5b60"), top: hexRgb("#5b5b60") });
  }
  const after = triangleCount(shaft) + triangleCount(shop) + triangleCount(trim);
  return { triangles: after - before, awnings, height: b.height };
}

export function chunkKey(i: number, j: number): string {
  return `${Math.floor((i + 7) / CHUNK_BLOCKS)},${Math.floor((j + 7) / CHUNK_BLOCKS)}`;
}

export function buildCity(blocks: readonly Block[], buildings: readonly Building[]): CityGeometry {
  const districtOfBlock = new Map<string, District>();
  for (const b of blocks) districtOfBlock.set(`${b.i},${b.j}`, b.district);
  const chunks = new Map<string, CityChunk>();
  const stats: CityStats = { buildings: 0, triangles: 0, byKind: { tower: 0, apartment: 0, brick: 0 }, tallest: 0, awnings: 0, chunks: 0 };
  buildings.forEach((b, index) => {
    const { i, j } = blockOf(b);
    const key = chunkKey(i, j);
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = { key, meshes: { shop: createMesh(), trim: createMesh() } };
      chunks.set(key, chunk);
    }
    const district = districtOfBlock.get(`${i},${j}`) ?? "outskirts";
    const out = dressBuilding(chunk, b, district, index);
    stats.buildings++;
    stats.triangles += out.triangles;
    stats.awnings += out.awnings;
    stats.tallest = Math.max(stats.tallest, out.height);
  });
  for (const c of chunks.values()) {
    for (const [key, m] of Object.entries(c.meshes)) {
      const kind = key.split(":")[0] as FacadeKind;
      if (kind in stats.byKind) stats.byKind[kind] += triangleCount(m) > 0 ? 1 : 0;
    }
  }
  stats.chunks = chunks.size;
  return { chunks: [...chunks.values()], stats };
}

/* ------------------------------------------------------------------ ground */

export const GROUND_HALF = 510;

/** The road-tile plane: a grid of quads whose UVs are in tiles so the 60 m tile repeats (tile origin at world 60k - 30). The drawn road is the same for any `cells`; the game uses one quad. */
export function roadPlane(cells = 1): MeshData {
  const m = createMesh();
  const span = (2 * GROUND_HALF) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x0 = -GROUND_HALF + i * span;
      const z1 = GROUND_HALF - j * span;
      // u = (x + 30) / PITCH and v = (30 - z) / PITCH for every cell count (the quad's `o` corner is its z1 edge, so v starts at 30 - z1)
      quad(m, [x0, 0.0, z1], [span, 0, 0], [0, 0, -span], [1, 1, 1], [(x0 + 30) / PITCH, (30 - z1) / PITCH], [(x0 + span + 30) / PITCH, (30 - z1 + span) / PITCH]);
    }
  }
  return m;
}

/** A square decal (park or plaza) one per block, lying 4 cm above the road plane. */
export function blockDecals(blocks: readonly Block[], kind: "park" | "plaza", half: number): MeshData {
  const m = createMesh();
  for (const b of blocks) {
    if (kind === "park" ? !b.park : !b.plaza) continue;
    quad(m, [b.x - half, 0.04, b.z + half], [2 * half, 0, 0], [0, 0, -2 * half], [1, 1, 1], [0, 0], [1, 1]);
  }
  return m;
}

/** A ring of distant towers and hills beyond the streets, in hazy solid colours (drawn unlit so the haze does not erase them). */
export function farCity(seed = 5): MeshData {
  const m = createMesh();
  const r = rng(seed);
  const towers = ["#dcc9a6", "#d2bd98", "#c8b28b"].map(hexRgb);
  const hills = ["#dcc59b", "#d3bb90"].map(hexRgb);
  for (let a = 0; a < 360; a += 3) {
    const ang = (a + r() * 3) * (Math.PI / 180);
    const dist = 1150 + r() * 330;
    const x = Math.sin(ang) * dist;
    const z = Math.cos(ang) * dist;
    if (r() > 0.78) {
      prism(m, x, -4, z, 160 + r() * 140, 70 + r() * 90, 6, hills[Math.floor(r() * 2)] as Rgb, hills[0] as Rgb);
    } else {
      const w = 22 + r() * 40;
      const h = 70 + r() * 200 * (r() > 0.7 ? 1.5 : 1);
      const c = towers[Math.floor(r() * 3)] as Rgb;
      box(m, x, -4, z, w, h, w * (0.6 + r() * 0.6), { side: c, top: c });
    }
  }
  return m;
}

/* ------------------------------------------------------------------ street furniture */

export interface Placement {
  x: number;
  z: number;
  yaw: number;
  seed: number;
}

export interface Pedestrian {
  x: number;
  z: number;
  yaw: number;
  shirt: string;
  pants: string;
  skin: string;
  scale: number;
}

export interface Furniture {
  pedestrians: Pedestrian[];
  lamps: Placement[];
  streetTrees: Placement[];
  signals: Placement[];
  parkTrees: (Placement & { palm: boolean; h: number })[];
}

/** Distance from a street centre line to the middle of the sidewalk. */
export const SIDEWALK_MID = 7;
const STOP_ZONE = 14;

const SHIRTS = ["#d4a02a", "#2f6b4a", "#b23a3a", "#2c466d", "#e9e0c8", "#7a3f6b", "#c46a2c", "#5d7d3c"];
const PANTS = ["#2f3138", "#3b4458", "#5a4a3a", "#26282e"];
const SKINS = ["#c68b5c", "#e0b48a", "#8d5a3a", "#f0cfa6", "#a46f48"];

/** About 270 people (the original's census is 456 walkers) on the sidewalks, seeded: walking along the street or standing, in the original's blocky style. */
export function buildPedestrians(count = 456): Pedestrian[] {
  const out: Pedestrian[] = [];
  const lines = STREET_LINES;
  for (let n = 0; n < count; n++) {
    const line = lines[Math.floor(noise(n * 3.13 + 0.2) * lines.length)] as number;
    const along = -430 + noise(n * 5.71 + 0.4) * 860;
    const side = noise(n * 7.9) > 0.5 ? 1 : -1;
    const onZ = noise(n * 11.3) > 0.5;
    // keep clear of the crossings (distance to the nearest street line along the walk)
    const t = ((along + 30) % PITCH + PITCH) % PITCH;
    if (t < 12 || t > PITCH - 12) continue;
    const off = side * (6.4 + noise(n * 2.3) * 1.5);
    const heading = noise(n * 13.7) > 0.5 ? 0 : Math.PI;
    out.push({
      x: onZ ? line + off : along,
      z: onZ ? along : line + off,
      yaw: (onZ ? heading : heading + Math.PI / 2) + (noise(n * 17.1) - 0.5) * 0.5,
      shirt: SHIRTS[Math.floor(noise(n * 19.3) * SHIRTS.length)] as string,
      pants: PANTS[Math.floor(noise(n * 23.9) * PANTS.length)] as string,
      skin: SKINS[Math.floor(noise(n * 29.1) * SKINS.length)] as string,
      scale: 0.92 + noise(n * 31.7) * 0.2
    });
  }
  return out;
}

export function buildFurniture(blocks: readonly Block[]): Furniture {
  const lamps: Placement[] = [];
  const streetTrees: Placement[] = [];
  const signals: Placement[] = [];
  const lines = STREET_LINES;
  let n = 0;
  for (let a = 0; a < lines.length; a++) {
    const line = lines[a] as number;
    for (let s = 0; s < lines.length - 1; s++) {
      const start = lines[s] as number;
      for (const side of [-1, 1]) {
        for (const t of [STOP_ZONE + 2, PITCH - STOP_ZONE - 2]) {
          n++;
          // street along z at x = line, and along x at z = line
          lamps.push({ x: line + side * SIDEWALK_MID, z: start + t, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, seed: n });
          lamps.push({ x: start + t, z: line + side * SIDEWALK_MID, yaw: side > 0 ? Math.PI : 0, seed: n + 0.5 });
        }
        if (noise(n * 3.7 + side) > 0.55) {
          streetTrees.push({ x: line + side * SIDEWALK_MID, z: start + PITCH / 2, yaw: noise(n * 1.3) * 6.28, seed: n });
        }
        if (noise(n * 5.3 + side * 2) > 0.62) {
          streetTrees.push({ x: start + PITCH / 2, z: line + side * SIDEWALK_MID, yaw: noise(n * 2.1) * 6.28, seed: n + 0.25 });
        }
      }
    }
  }
  for (const ax of lines) {
    for (const az of lines) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          signals.push({ x: ax + sx * 6.9, z: az + sz * 6.9, yaw: Math.atan2(-sx, -sz), seed: (ax * 31 + az * 17 + sx * 3 + sz) % 97 });
        }
      }
    }
  }
  const parkTrees: Furniture["parkTrees"] = [];
  blocks
    .filter((b) => b.park)
    .forEach((b, bi) => {
      for (let k = 0; k < 16; k++) {
        const r = noise(bi * 31 + k * 3.7);
        const x = b.x + (noise(bi * 17 + k * 5.3) - 0.5) * 34;
        const z = b.z + (noise(bi * 13 + k * 7.9) - 0.5) * 34;
        // keep the central lawn and the crossing paths open
        if (Math.abs(x - b.x) < 2.4 || Math.abs(z - b.z) < 2.4) continue;
        parkTrees.push({ x, z, yaw: r * 6.28, seed: bi * 100 + k, palm: noise(bi * 7 + k * 2.9) > 0.55, h: 3.4 + 3.4 * r });
      }
    });
  return { pedestrians: buildPedestrians(), lamps, streetTrees, signals, parkTrees };
}


/** Collision half sizes (metres) of the street furniture: thin posts stop the car hard, trees and people give way a little. */
export const FURNITURE_HALF = { lamp: 0.22, signal: 0.22, tree: 0.4, pedestrian: 0.3 } as const;

/**
 * Collision solids for the street furniture (checklist M6): lamps and signals are `post` solids (the sim stops the car
 * at 0.42 of its speed into them), street and park trees and pedestrians are `prop` solids (a soft shove, 0.16).
 * Pedestrians stand on the sidewalk 6.4 to 7.9 m from the centre line, outside both 4.2 m traffic lanes.
 */
export function furnitureSolids(f: Furniture): Solid[] {
  const out: Solid[] = [];
  const add = (x: number, z: number, h: number, kind: Solid["kind"]): void => { out.push({ x, z, hw: h, hd: h, kind }); };
  for (const p of f.lamps) add(p.x, p.z, FURNITURE_HALF.lamp, "post");
  for (const p of f.signals) add(p.x, p.z, FURNITURE_HALF.signal, "post");
  for (const t of f.streetTrees) add(t.x, t.z, FURNITURE_HALF.tree, "prop");
  for (const t of f.parkTrees) add(t.x, t.z, FURNITURE_HALF.tree, "prop");
  for (const p of f.pedestrians) add(p.x, p.z, FURNITURE_HALF.pedestrian, "prop");
  return out;
}

/* ------------------------------------------------------------------ merged static props */

const LEAVES = ["#6f9a45", "#7aa84e", "#5f8a3e", "#86b05a", "#6a9f58"].map(hexRgb);
const SIGNAL_LAMP = ["#ff4a38", "#ffc23a", "#48e07a"].map(hexRgb);

/**
 * Lamps, traffic lights, street and park trees and pedestrians as ONE static mesh in palette colours. Instanced meshes were
 * drawn instance by instance in every shadow cascade (about 540 draws per cascade for the lamps alone); merged, they are one
 * draw and never cast shadows.
 */
export interface PropSkip {
  readonly lamp?: (x: number, z: number) => boolean;
  readonly signal?: (x: number, z: number) => boolean;
  readonly tree?: (x: number, z: number) => boolean;
}

export function buildProps(f: Furniture, skip: PropSkip = {}): MeshData {
  const m = createMesh();
  const metal = hexRgb("#3a3d44");
  const lampHead = hexRgb("#f4efe0");
  const housing = hexRgb("#1c1d22");
  for (const p of f.lamps) {
    if (skip.lamp?.(p.x, p.z)) continue;
    box(m, p.x, 0, p.z, 0.08, 5.6, 0.08, { side: metal, top: metal });
    const [ox, oz] = [Math.sin(p.yaw) * 0.7, Math.cos(p.yaw) * 0.7];
    orientedBox(m, p.x + ox, 5.5, p.z + oz, p.yaw, 0.05, 0.1, 0.75, metal, metal);
    orientedBox(m, p.x + Math.sin(p.yaw) * 1.35, 5.44, p.z + Math.cos(p.yaw) * 1.35, p.yaw, 0.17, 0.12, 0.35, lampHead, lampHead);
  }
  for (const p of f.signals) {
    if (skip.signal?.(p.x, p.z)) continue;
    box(m, p.x, 0, p.z, 0.07, 4.2, 0.07, { side: metal, top: metal });
    orientedBox(m, p.x + Math.sin(p.yaw) * 0.9, 4.0, p.z + Math.cos(p.yaw) * 0.9, p.yaw, 0.05, 0.1, 0.9, metal, metal);
    const hx = p.x + Math.sin(p.yaw) * 1.7;
    const hz = p.z + Math.cos(p.yaw) * 1.7;
    orientedBox(m, hx, 3.2, hz, p.yaw, 0.18, 1.0, 0.16, housing, housing);
    const state = ((Math.round(p.seed) % 3) + 3) % 3;
    const lamp = SIGNAL_LAMP[state] as Rgb;
    orientedBox(m, p.x + Math.sin(p.yaw) * 1.86, 3.2 + (state === 0 ? 0.7 : state === 1 ? 0.4 : 0.1), p.z + Math.cos(p.yaw) * 1.86, p.yaw, 0.1, 0.2, 0.03, lamp, lamp);
  }
  const trunk = hexRgb("#7a5a3c");
  const pushRound = (x: number, z: number, h: number, seed: number): void => {
    prism(m, x, 0, z, 0.17, h * 0.62, 6, trunk, trunk);
    const r = h * 0.42;
    blob(m, x, h * 0.78, z, r, r * 0.9, 7, LEAVES[Math.floor(seed * 3) % LEAVES.length] as Rgb);
    blob(m, x + r * 0.5, h * 0.95, z - r * 0.3, r * 0.65, r * 0.6, 6, LEAVES[(Math.floor(seed * 3) + 2) % LEAVES.length] as Rgb);
  };
  const pushPalm = (x: number, z: number, h: number, seed: number): void => {
    prism(m, x, 0, z, 0.17, h, 6, trunk, trunk);
    for (let k = 0; k < 7; k++) {
      const a = seed + (k * Math.PI * 2) / 7;
      const pitch = 0.42 + 0.1 * (k % 3);
      const len = 3.4;
      const d: [number, number, number] = [Math.sin(a) * Math.cos(pitch), -Math.sin(pitch), Math.cos(a) * Math.cos(pitch)];
      const side: [number, number, number] = [Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38];
      const b: [number, number, number] = [x, h + 0.2, z];
      const tip: [number, number, number] = [b[0] + d[0] * len, b[1] + d[1] * len, b[2] + d[2] * len];
      const left: [number, number, number] = [b[0] - side[0], b[1], b[2] - side[2]];
      const right: [number, number, number] = [b[0] + side[0], b[1], b[2] + side[2]];
      const c = hexRgb(k % 2 ? "#5b8f3e" : "#6aa046");
      tri(m, right, left, tip, c);
      tri(m, left, right, tip, c);
    }
  };
  f.streetTrees.forEach((t) => {
    if (skip.tree?.(t.x, t.z)) return;
    if (Math.floor(t.seed * 7) % 2 === 0) pushPalm(t.x, t.z, 6 + (t.seed % 4), t.seed);
    else pushRound(t.x, t.z, 3.4 + (t.seed % 5) * 0.35, t.seed);
  });
  for (const t of f.parkTrees) {
    if (skip.tree?.(t.x, t.z)) continue;
    if (t.palm) pushPalm(t.x, t.z, 5.5 + t.h * 0.5, t.seed);
    else pushRound(t.x, t.z, t.h, t.seed);
  }
  for (const p of f.pedestrians) {
    const k = p.scale;
    orientedBox(m, p.x, 0, p.z, p.yaw, 0.21 * k, 0.84 * k, 0.13 * k, hexRgb(p.pants), hexRgb(p.pants));
    orientedBox(m, p.x, 0.84 * k, p.z, p.yaw, 0.26 * k, 0.6 * k, 0.15 * k, hexRgb(p.shirt), hexRgb(p.shirt));
    orientedBox(m, p.x, 1.44 * k, p.z, p.yaw, 0.15 * k, 0.32 * k, 0.15 * k, hexRgb(p.skin), hexRgb(p.skin));
  }
  return m;
}
