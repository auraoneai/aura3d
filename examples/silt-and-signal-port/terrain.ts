/**
 * Pure world geometry for Silt & Signal: the terrain heightfield, road and canal ribbons, and the prop layout.
 *
 * Chapter 0 uses the measured object layout of the original (positions, radii and heights of its 1400 world
 * colliders, recorded in the reference capture); the other chapters scatter props from a seeded generator along
 * the same road. The terrain function is authored for this port: the flat corridor around the objective path
 * keeps the rider's flight space clear, hills rise outside it.
 */
import { CHAPTERS } from "./chapters-data";
import { CHAPTER0_COLLIDERS, COLLIDER_FLAGS } from "./colliders-ch0";
import { bridgeArch, canalCentre, ground0 } from "./world-ch0";
import type { Collider } from "./collide";
import type { World } from "./sim";

export interface MeshData { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }

export const roadX = (z: number): number => 82 + Math.sin(z * 0.006) * 8;
export const canalX = (z: number): number => roadX(z) - 62;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const hash2 = (ix: number, iz: number): number => {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const vnoise = (x: number, z: number): number => {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
};
export const fbm = (x: number, z: number, octaves = 4): number => {
  let amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += amp * vnoise(x, z); norm += amp; x = x * 2.03 + 17.1; z = z * 2.03 - 9.7; amp *= 0.5; }
  return sum / norm;
};

export const seededRandom = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
};

export interface Placement { x: number; y: number; z: number; scale: number; yaw: number }
export interface Column { x: number; z: number; r: number; bottom: number; top: number }
export interface PropSet {
  trees: Placement[];
  rocks: Placement[];
  houses: Placement[];
  lamps: Placement[];
  /** limestone piers and arch posts */
  stone: Column[];
  /** thin brass posts and banner masts */
  brass: Column[];
  /** box colliders of the original (cliff terraces, aqueduct walls, building masses) */
  walls: Wall[];
}
export interface Wall { x: number; z: number; halfX: number; halfZ: number; bottom: number; top: number; kind: "cliff" | "stone" | "plaster" }
export interface WaterInfo { readonly level: number; readonly half: number; readonly shift: number }

export const TERRAIN_X0 = -470;
export const TERRAIN_X1 = 630;

/** Chapters 0 and 6 use the original's terrain (canal trench along `canalCentre`); the others use this port's generated hills. */
export const usesOriginalTerrain = (chapter: number): boolean => chapter === 0 || chapter === 6;

export interface Terrain {
  readonly chapter: number;
  readonly length: number;
  heightAt(x: number, z: number): number;
  corridorDistance(x: number, z: number): number;
  readonly water: WaterInfo;
  terrainMesh(): MeshData;
  /** paved plaza under the village rectangle (chapters 0 and 6) or empty */
  plazaMesh(): MeshData;
  roadMesh(): MeshData;
  bankMesh(): MeshData;
  waterMesh(): MeshData;
  /** the cistern bridge deck (chapter 0) or empty */
  deckMesh(): MeshData;
  props(): PropSet;
}

type Seg = readonly [number, number, number, number];

/** The paved plaza of the original-terrain chapters (0 and 6). Exported read-only for the DG-W2 decals. */
export const PLAZA = { x0: -70, x1: 225, z0: -365, z1: 115 } as const;

export function createTerrain(chapter: number): Terrain {
  const original = usesOriginalTerrain(chapter);
  const inPlaza = (x: number, z: number): boolean => x > PLAZA.x0 && x < PLAZA.x1 && z > PLAZA.z0 && z < PLAZA.z1;
  const CELL = original ? 8 : 10;
  const centreOf = original ? canalCentre : canalX;
  const water: WaterInfo = original ? { level: -1.4, half: 25, shift: 0 } : { level: -0.55, half: 16, shift: 62 };
  const ch = CHAPTERS[chapter]!;
  const length = ch.length;
  const zFar = -length - 140;
  const zNear = 190;

  const path: [number, number][] = [];
  for (const o of ch.objectives) for (const p of o.points) path.push([p.x, p.z]);
  path.unshift([path[0]![0], 60]);
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < path.length; i++) segs.push([path[i]![0], path[i]![1], path[i + 1]![0], path[i + 1]![1]]);
  for (let z = zNear; z > zFar; z -= 60) segs.push([roadX(z), z, roadX(z - 60), z - 60]);

  const corridorDistance = (x: number, z: number): number => {
    let best = Infinity;
    for (const [ax, az, bx, bz] of segs) {
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) best = d;
    }
    return best;
  };

  const heightAt = (x: number, z: number): number => {
    if (original) return ground0(x, z);
    const d = corridorDistance(x, z);
    const mask = smoothstep(70, 210, d);
    const broad = fbm(x * 0.0036 + 11, z * 0.0036 - 4, 4);
    const ridge = 1 - Math.abs(2 * fbm(x * 0.0075, z * 0.0075 + 9, 3) - 1);
    const hills = (broad * 0.5 + ridge * ridge * 0.8) * 78;
    const rolling = (fbm(x * 0.022, z * 0.022, 3) - 0.5) * 9 * smoothstep(30, 100, d);
    const dc = Math.abs(x - canalX(z));
    const carve = 2.4 * (1 - smoothstep(6, 19, dc));
    return hills * mask + rolling - carve;
  };

  const normalAt = (x: number, z: number): [number, number, number] => {
    const e = 1.5;
    const nx = heightAt(x - e, z) - heightAt(x + e, z);
    const nz = heightAt(x, z - e) - heightAt(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  };

  const pushTri = (m: MeshData, a: number, b: number, c: number): void => { m.indices.push(a, b, c); };

  const terrainMesh = (): MeshData => {
    const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
    const cols = Math.round((TERRAIN_X1 - TERRAIN_X0) / CELL) + 1;
    const rows = Math.round((zNear - zFar) / CELL) + 1;
    const tile = 16;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = TERRAIN_X0 + c * CELL, z = zFar + r * CELL;
        const y = heightAt(x, z);
        const n = normalAt(x, z);
        m.positions.push(x, y, z);
        m.normals.push(n[0], n[1], n[2]);
        m.uvs.push(x / tile, z / tile);
      }
    }
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        if (original && inPlaza(TERRAIN_X0 + (c + 0.5) * CELL, zFar + (r + 0.5) * CELL)) continue;
        const i = r * cols + c;
        pushTri(m, i, i + cols, i + 1);
        pushTri(m, i + 1, i + cols, i + cols + 1);
      }
    }
    return m;
  };

  const plazaMesh = (): MeshData => {
    const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
    if (!original) return m;
    const x0 = TERRAIN_X0 + Math.floor((PLAZA.x0 - TERRAIN_X0) / CELL) * CELL, z0 = zFar + Math.floor((PLAZA.z0 - zFar) / CELL) * CELL;
    const cols = Math.ceil((PLAZA.x1 - x0) / CELL) + 1, rows = Math.ceil((PLAZA.z1 - z0) / CELL) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * CELL, z = z0 + r * CELL, n = normalAt(x, z);
        m.positions.push(x, heightAt(x, z) + 0.02, z);
        m.normals.push(n[0], n[1], n[2]);
        m.uvs.push(x / 7, z / 7);
      }
    }
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c + 1 < cols; c++) {
        if (!inPlaza(x0 + (c + 0.5) * CELL, z0 + (r + 0.5) * CELL)) continue;
        const i = r * cols + c;
        pushTri(m, i, i + cols, i + 1);
        pushTri(m, i + 1, i + cols, i + cols + 1);
      }
    }
    return m;
  };

  /** A ribbon of constant half-width along a centre line x = centre(z), draped on the terrain. */
  const ribbon = (centre: (z: number) => number, inner: number, outer: number, lift: number, tile: number, drape: boolean, flatY = 0): MeshData => {
    const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
    const step = 6;
    const offsets = inner === 0 ? [-outer, 0, outer] : [-outer, -inner, inner, outer];
    let row = 0;
    for (let z = zNear; z >= zFar; z -= step, row++) {
      const cx = centre(z);
      for (const o of offsets) {
        const x = cx + o;
        const y = (drape ? heightAt(x, z) : flatY) + lift;
        const n = drape ? normalAt(x, z) : [0, 1, 0];
        m.positions.push(x, y, z);
        m.normals.push(n[0]!, n[1]!, n[2]!);
        m.uvs.push(o / tile, z / tile);
      }
      if (row > 0) {
        const k = offsets.length, a = (row - 1) * k, b = row * k;
        for (let s = 0; s + 1 < k; s++) {
          // skip the gap quad between the two inner offsets of a ring-shaped ribbon
          if (inner !== 0 && s === 1) continue;
          pushTri(m, a + s, b + s, a + s + 1);
          pushTri(m, a + s + 1, b + s, b + s + 1);
        }
      }
    }
    return m;
  };

  const roadY = (x: number, z: number): number => (original ? Math.max(0.6, heightAt(x, z), bridgeArch(x, z) ?? -Infinity) : heightAt(x, z));

  /** A paved strip of the given half-width along a polyline, draped on `roadY`. */
  const pathRibbon = (pts: readonly (readonly [number, number])[], half: number, lift: number, tile: number): MeshData => {
    const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
    let along = 0, row = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const steps = Math.max(1, Math.ceil(len / 6));
      for (let k = 0; k <= steps; k++) {
        if (k === 0 && i > 0) continue;
        const t = k / steps, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        for (const side of [-1, 1]) {
          const x = cx + nx * half * side, z = cz + nz * half * side;
          m.positions.push(x, roadY(x, z) + lift, z);
          m.normals.push(0, 1, 0);
          m.uvs.push(side * half / tile, (along + len * t) / tile);
        }
        if (row > 0) { const a = (row - 1) * 2, b = row * 2; pushTri(m, a, b, a + 1); pushTri(m, a + 1, b, b + 1); }
        row++;
      }
      along += len;
    }
    return m;
  };

  const roadMesh = (): MeshData => (original ? pathRibbon(path, 5.5, 0.08, 8) : ribbon(roadX, 0, 8.5, 0.07, 8, true));
  const bankMesh = (): MeshData => (original ? { positions: [], normals: [], uvs: [], indices: [] } : ribbon(canalX, 15.5, 23, 0.3, 14, true));
  const waterMesh = (): MeshData => ribbon(centreOf, 0, water.half, 0, 10, false, water.level);
  const deckMesh = (): MeshData => {
    const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
    if (chapter !== 0) return m;
    const n = 48;
    for (let k = 0; k <= n; k++) {
      const x = 37 + (95 * k) / n;
      for (const z of [-190, -170]) {
        m.positions.push(x, (bridgeArch(x, -180) ?? 0.6) + 0.12, z);
        m.normals.push(0, 1, 0);
        m.uvs.push(x / 8, z / 8);
      }
      if (k > 0) { const a = (k - 1) * 2, b = k * 2; pushTri(m, a, a + 1, b); pushTri(m, a + 1, b + 1, b); }
    }
    return m;
  };

  const emptyProps = (): PropSet => ({ trees: [], rocks: [], houses: [], lamps: [], stone: [], brass: [], walls: [] });
  const props = (): PropSet => (chapter === 0 ? chapterZeroProps() : scatterProps());

  const chapterZeroProps = (): PropSet => {
    const out = emptyProps();
    const rng = seededRandom(0x51a7);
    for (const [x, z, r, bottom, top, halfX, halfZ, flags] of CHAPTER0_COLLIDERS) {
      const h = top - bottom;
      const village = (flags & COLLIDER_FLAGS.village) !== 0;
      const base = bottom > 4 ? bottom : Math.max(0, heightAt(x, z));
      if (halfX >= 0) {
        const big = Math.max(halfX, halfZ) >= 20;
        out.walls.push({ x, z, halfX, halfZ, bottom: Math.max(bottom, -2), top, kind: big ? "cliff" : village ? "plaster" : "stone" });
      } else if (r >= 4) {
        const s = Math.max(5, Math.min(10, top / 2.1));
        out.houses.push({ x, y: base, z, scale: s, yaw: Math.floor(rng() * 4) * (Math.PI / 2) });
      } else if (village) {
        if (top <= 3) out.lamps.push({ x, y: base, z, scale: Math.max(2.4, h * 1.6), yaw: 0 });
        else out.brass.push({ x, z, r: Math.max(0.25, r * 0.45), bottom: base, top });
      } else if (r < 0.7) {
        if (h >= 3) out.trees.push({ x, y: base, z, scale: h / 1.5, yaw: rng() * Math.PI * 2 });
        else out.rocks.push({ x, y: base, z, scale: Math.max(1.2, h * 1.4 + 1), yaw: rng() * Math.PI * 2 });
      } else {
        out.stone.push({ x, z, r, bottom: Math.max(bottom, base - 1), top });
      }
    }
    return out;
  };

  const scatterProps = (): PropSet => {
    const out = emptyProps();
    const rng = seededRandom(0x9e3779b1 ^ (chapter * 7919));
    const gauss = (): number => (rng() + rng() + rng() - 1.5) / 1.5;
    const keepClear = (x: number, z: number, d: number): boolean => corridorDistance(x, z) > d && Math.abs(x - centreOf(z)) > water.half - 2 && Math.abs(x - roadX(z)) > 10;
    for (let tries = 0; out.trees.length < 520 && tries < 6000; tries++) {
      const z = zFar + 60 + rng() * (zNear - zFar - 80);
      const x = roadX(z) + gauss() * 190 - 10;
      if (x < TERRAIN_X0 + 20 || x > TERRAIN_X1 - 20 || !keepClear(x, z, 22)) continue;
      const y = heightAt(x, z);
      if (y > 30) continue;
      out.trees.push({ x, y, z, scale: 4 + rng() * 6, yaw: rng() * Math.PI * 2 });
    }
    for (let tries = 0; out.rocks.length < 170 && tries < 4000; tries++) {
      const z = zFar + 60 + rng() * (zNear - zFar - 80);
      const x = roadX(z) + gauss() * 260;
      if (x < TERRAIN_X0 + 20 || x > TERRAIN_X1 - 20 || !keepClear(x, z, 16)) continue;
      out.rocks.push({ x, y: heightAt(x, z), z, scale: 2 + rng() * 7, yaw: rng() * Math.PI * 2 });
    }
    const hubs = ch.objectives.map((o) => o.points[o.points.length - 1]!);
    for (const hub of hubs) {
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2, d = 38 + rng() * 40;
        const x = hub.x + Math.cos(a) * d, z = hub.z + Math.sin(a) * d;
        if (!keepClear(x, z, 26)) continue;
        out.houses.push({ x, y: Math.max(0, heightAt(x, z)), z, scale: 5 + rng() * 3, yaw: Math.floor(rng() * 4) * (Math.PI / 2) });
      }
    }
    for (let z = 120; z > zFar; z -= 34) {
      for (const side of [-1, 1]) {
        const x = roadX(z) + side * (original ? 40 : 11.5);
        out.lamps.push({ x, y: Math.max(0, heightAt(x, z)), z, scale: 4.2, yaw: 0 });
      }
    }
    for (let z = 60; z > zFar; z -= 170) {
      const c = centreOf(z), off = water.half - 2;
      out.stone.push({ x: c - off, z, r: 2.4, bottom: -1, top: 30 + (hash2(z | 0, 3) * 18) });
      out.stone.push({ x: c + off, z, r: 2.4, bottom: -1, top: 30 + (hash2(z | 0, 5) * 18) });
    }
    return out;
  };

  return { chapter, length, water, heightAt, corridorDistance, terrainMesh, plazaMesh, roadMesh, bankMesh, waterMesh, deckMesh, props };
}

/*
 * Model footprints used for the chapter 1-6 colliders, from the GLB bounds (gltf-transform getBounds) and the transforms in
 * world.ts: house.glb is 1.64 x 0.88 x 0.97 (centred on its placement after the -0.064 z offset), lamp.glb stands 1.87 tall
 * at `y + 0.95 * scale`, tree.glb is 0.93 wide and 1.68 tall (the collider is the trunk and the lower crown, not the full
 * crown width), and the canyon-rock and polyhedron boulders reach about 0.45 x scale out and 0.5 x scale up.
 */
const HOUSE_HALF_X = 0.82, HOUSE_HALF_Z = 0.49, HOUSE_HEIGHT = 0.88;
const TREE_COLLIDER_R = 0.22, TREE_HEIGHT = 1.684;
const ROCK_COLLIDER_R = 0.45, ROCK_HEIGHT = 0.5;
const LAMP_COLLIDER_R = 0.16, LAMP_HEIGHT = 1.87;

/** Round and box colliders for the scattered props of chapters 1-6 (every solid thing the chapter renders). */
export function scatterColliders(props: PropSet): Collider[] {
  const out: Collider[] = [];
  for (const h of props.houses) {
    const quarter = Math.abs(Math.sin(h.yaw)) > 0.5;
    const hx = (quarter ? HOUSE_HALF_Z : HOUSE_HALF_X) * h.scale, hz = (quarter ? HOUSE_HALF_X : HOUSE_HALF_Z) * h.scale;
    out.push({ x: h.x, z: h.z, r: Math.max(hx, hz), bottom: h.y - 1, top: h.y + HOUSE_HEIGHT * h.scale, halfX: hx, halfZ: hz });
  }
  for (const t of props.trees) out.push({ x: t.x, z: t.z, r: TREE_COLLIDER_R * t.scale, bottom: t.y - 1, top: t.y + TREE_HEIGHT * t.scale });
  for (const r of props.rocks) out.push({ x: r.x, z: r.z, r: ROCK_COLLIDER_R * r.scale, bottom: r.y - 1, top: r.y + ROCK_HEIGHT * r.scale });
  for (const l of props.lamps) {
    const s = Math.max(2.2, l.scale);
    out.push({ x: l.x, z: l.z, r: LAMP_COLLIDER_R * s, bottom: l.y - 1, top: l.y + LAMP_HEIGHT * s });
  }
  for (const c of [...props.stone, ...props.brass]) out.push({ x: c.x, z: c.z, r: c.r, bottom: c.bottom, top: c.top });
  return out;
}

const physicsCache = new Map<number, Partial<World>>();

/**
 * Floor and colliders for chapters 1-6: the rendered terrain height (never below the 0.6 road baseline) and a collider for
 * every scattered prop, so the rider and the chase camera cannot pass through hills, houses, trees, rocks, lamps or piers.
 * Chapter 0 keeps the original's measured world (`world-ch0.ts`).
 */
export function terrainPhysics(chapter: number): Partial<World> {
  let cached = physicsCache.get(chapter);
  if (!cached) {
    const terrain = createTerrain(chapter);
    cached = { floor: (x: number, z: number) => Math.max(0.6, terrain.heightAt(x, z)), colliders: scatterColliders(terrain.props()) };
    physicsCache.set(chapter, cached);
  }
  return cached;
}
