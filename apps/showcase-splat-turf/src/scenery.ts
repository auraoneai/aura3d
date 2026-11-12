/**
 * Splat Turf world dressing (WP-16 procedural multi-material Street-Sport Ink Arena, presentation only):
 * the primed gesso road runs through a sunlit street-sport ink arena boulevard over a fair-weather cloud sea.
 * Everything here is a pure function of the shown distance, elapsed time, and road row, so it never reads or
 * advances the simulation's random stream.
 *
 * Performance & draw-call consolidation:
 * - Corridor dressing batches (`keel`, `drips`, `posts`, `bulbs`, `pennants`, `islets`) carry tight `CORRIDOR_BOUNDS`
 *   with `castShadow: false, receiveShadow: false` (zero shadow-pass vertex leak).
 * - Multi-material Street-Sport Ink Arena sideline architecture (pressurized chromed ink-reservoir tanks with
 *   translucent `material.physical` sight-glasses, skatepark bleachers with sun-sail canopies, truss speaker &
 *   floodlight towers, aerosol monuments, inflatable turf barriers, and potted street palms) is consolidated into
 *   2 seamless scrolling `ARENA_BELT_SPAN` belts (`assembleMultiMaterialNode` + `castShadow: false` sight-glass pass).
 * - The 14 sky-studio islands and hot-air balloons are consolidated into 6 procedural `instances.custom` nodes
 *   (`clearcoat: 0, sheen: 0`, zero static `.glb` assets).
 */
import { type AuraApp, type AuraSceneBuilder } from "@aura3d/engine";
import { Batch, CORRIDOR_BOUNDS, hexToLinear, type BatchBounds, type CustomSpec, type MeshData, type Rgb } from "../../../examples/shared/runner-kit/index";
import { boxMesh, cylinderMesh, merge, sphereMesh, translateMesh } from "./meshes";
import { LOOK, paintColorFor } from "./look";
import {
  ARENA_BELT_SPAN,
  createTurfArenaSidelineBelts,
  createTurfBackdropIslandNodes,
  turfGooseneckPostMesh,
  turfLampBulbMesh,
  type TurfBackdropKind
} from "./art/proceduralModels";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const SKY_LAYER_BOUNDS: BatchBounds = { min: [-420, -48, -440], max: [420, 96, 140] };

/* ------------------------------------------------------------------ meshes */

/** Frustum (top radius `top`, bottom radius `bottom`) from y = 0 down to y = -height, capped top. */
function frustumMesh(top: number, bottom: number, height: number, radial: number, phase = 0): MeshData {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const slope = (top - bottom) / height;
  for (let i = 0; i <= radial; i++) {
    const a = (i / radial) * Math.PI * 2 + phase, c = Math.cos(a), s = Math.sin(a);
    const n = Math.hypot(1, slope);
    m.positions.push(c * top, 0, s * top, c * bottom, -height, s * bottom);
    m.normals.push(c / n, slope / n, s / n, c / n, slope / n, s / n);
    m.uvs.push(i / radial, 0, i / radial, 1);
  }
  for (let i = 0; i < radial; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    m.indices.push(a, c, b, b, c, d);
  }
  const centre = m.positions.length / 3;
  m.positions.push(0, 0, 0);
  m.normals.push(0, 1, 0);
  m.uvs.push(0.5, 0.5);
  for (let i = 0; i <= radial; i++) {
    const a = (i / radial) * Math.PI * 2 + phase;
    m.positions.push(Math.cos(a) * top, 0, Math.sin(a) * top);
    m.normals.push(0, 1, 0);
    m.uvs.push(0.5, 0.5);
  }
  for (let i = 0; i < radial; i++) m.indices.push(centre, centre + 2 + i, centre + 1 + i);
  return m;
}

function scaleMesh(m: MeshData, sx: number, sy: number, sz: number): MeshData {
  const p = m.positions.slice();
  for (let i = 0; i < p.length; i += 3) { p[i] = p[i]! * sx; p[i + 1] = p[i + 1]! * sy; p[i + 2] = p[i + 2]! * sz; }
  return { ...m, positions: p };
}

/** Lumpy cumulus puff: five overlapping spheres, flat-ish base, about 4.4 x 2 x 2.6 at scale 1. */
export function puffMesh(): MeshData {
  return merge([
    sphereMesh(1.0, 9, 6, 0, 0, 0),
    sphereMesh(0.8, 7, 5, 1.15, -0.18, 0.15),
    sphereMesh(0.75, 7, 5, -1.05, -0.22, -0.1),
    sphereMesh(0.7, 7, 5, 0.35, 0.5, -0.25),
    sphereMesh(0.62, 7, 5, -0.45, 0.32, 0.45)
  ]);
}

/** Floating turf islet: sunlit park turf cap over a slate rock cone, with per-vertex tone. */
function isletParts(): { mesh: MeshData; tone: number[] } {
  const grass = translateMesh(cylinderMesh(1.05, 0.22, 12), 0, -0.11, 0);
  const rock = translateMesh(frustumMesh(0.98, 0.12, 1.5, 8), 0, -0.2, 0);
  const pebble = translateMesh(frustumMesh(0.32, 0.04, 0.5, 6), 0.55, -0.85, 0.2);
  const g = hexToLinear(LOOK.turf), r = hexToLinear("#56466d"), p = hexToLinear("#72608c");
  const parts: [MeshData, Rgb][] = [[grass, g], [rock, r], [pebble, p]];
  const tone: number[] = [];
  for (const [m, c] of parts) for (let v = 0; v < m.positions.length / 3; v++) tone.push(c[0], c[1], c[2]);
  return { mesh: merge(parts.map(([m]) => m)), tone };
}

/** Paint drip hanging from y = 0: a stem and a round bead at the end (scaled per instance on y). */
const dripMesh = (): MeshData => merge([translateMesh(cylinderMesh(0.09, 1, 6), 0, -0.5, 0), sphereMesh(0.15, 6, 4, 0, -1, 0)]);
/** Curved skate-arena gooseneck lamp post (`base y = 0`, reflector hood overhanging track); bulb is a separate glow batch. */
const postMesh = (): MeshData => turfGooseneckPostMesh();
const bulbMesh = (): MeshData => turfLampBulbMesh();
/** Pennant: a downward triangle hanging from y = 0, 0.5 wide, facing the road. */
function pennantMesh(): MeshData {
  const flag: MeshData = { positions: [-0.25, 0, 0, 0.25, 0, 0, 0, -0.5, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 0.5, 1], indices: [0, 2, 1] };
  return merge([flag, translateMesh(boxMesh(LAMP_SPACING / PENNANTS_PER_SPAN + 0.04, 0.035, 0.035), 0, 0.01, 0)]);
}
/** Road keel: the architectural underside that turns the deck into an elevated causeway ribbon. */
export const keelMesh = (): MeshData => scaleMesh(frustumMesh(1, 0.72, 1, 4, Math.PI / 4), 3.2 * Math.SQRT2, 0.9, 0.52 * Math.SQRT2);

/* ------------------------------------------------------------------ layout */

const hash = (a: number, b: number): number => {
  const h = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

/** Lamp posts every LAMP_SPACING rows on both edges; pennants string between neighbours. */
export const LAMP_SPACING = 8;
const PENNANTS_PER_SPAN = 6;
/** Islets host the paint pots, one every PROP_SPACING rows per side (world.ts). */
const ISLET_SPACING = 10;
/** Paint drips may hang off every other row on each edge. */
const DRIP_SPACING = 2;

class RowPool {
  readonly rows: Float64Array;
  constructor(readonly perSide: number, readonly spacing: number) {
    this.rows = new Float64Array(perSide * 2).fill(Number.NaN);
  }
  slot(row: number, side: number): number {
    return side * this.perSide + (Math.floor(row / this.spacing) % this.perSide);
  }
}

const WINDOW_BACK = 30;

export type BackdropAssetKind = TurfBackdropKind;

export interface Piece {
  readonly id: string;
  readonly kind: BackdropAssetKind;
  readonly side: -1 | 1;
  readonly offset: number;
  readonly y: number;
  readonly z0: number;
  readonly size: number;
  readonly spin: number;
}

const SPAN = 190;
const NEAR = 14;
const FAR = NEAR - SPAN;

const ASSET_KINDS: readonly BackdropAssetKind[] = [
  "balloon",
  "easelIsland",
  "islandTower",
  "islandTree",
  "paintPotIsland",
  "paletteIsland"
];

export const PIECES: readonly Piece[] = (() => {
  const kinds: BackdropAssetKind[] = [
    "islandTree", "paintPotIsland", "balloon", "islandTower", "paletteIsland", "balloon", "easelIsland",
    "islandTree", "balloon", "paintPotIsland", "islandTower", "balloon", "paletteIsland", "islandTree"
  ];
  return kinds.map((kind, i): Piece => {
    const side = (i % 2 === 0 ? -1 : 1) as -1 | 1;
    const balloon = kind === "balloon";
    return {
      id: `isle-${i}`, kind, side,
      offset: (balloon ? 15 : 17) + ((i * 7) % 5) * 3.4,
      y: balloon ? 6 + ((i * 5) % 4) * 1.8 : -5 + ((i * 3) % 5) * 1.5,
      z0: (i / kinds.length) * SPAN + ((i * 11) % 7),
      size: balloon ? 5.5 : kind === "islandTower" ? 12 : 10.5,
      spin: i % 3 === 0 ? 0.1 : -0.08
    };
  });
})();

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Island pose: scrolls at 0.55x the road (reads as further away), grows in at the far end, out near the camera. */
export function piecePose(p: Piece, distance: number, elapsed: number, reduced: boolean) {
  const z = ((((p.z0 + distance * 0.55) % SPAN) + SPAN) % SPAN) + FAR;
  const fade = smooth((z - FAR) / 30) * smooth((NEAR - z) / 20);
  const t = reduced ? 0 : elapsed;
  const bob = Math.sin(t * 0.7 + p.z0) * (p.kind === "balloon" ? 0.5 : 0.25);
  return { x: p.side * p.offset, y: p.y + bob, z, fade, yaw: t * p.spin + p.z0 };
}

/* cloud sea: TILE-long pattern repeated three times in a frame that scrolls with the road */
const CLOUD_TILE = 110;
const CLOUDS_PER_TILE = 26;
const HORIZON_PUFFS = 34;
const HIGH_PUFFS = 12;

/* ------------------------------------------------------------------ builder */

export interface SceneryPrograms {
  readonly toonTone: CustomSpec;
  readonly cloud: CustomSpec;
  readonly far: CustomSpec;
  readonly keel: CustomSpec;
  readonly glow: CustomSpec;
}

export interface Scenery {
  placeSegment(i: number, row: number): void;
  placeIslet(row: number, side: number, x: number, sc: number): void;
  update(node: (id: string) => NodeHandle, roadZ: number, distance: number, elapsed: number, reduced: boolean): void;
  readonly batches: readonly Batch[];
}

export const SCENERY_BATCH_IDS = ["keel", "drips", "posts", "bulbs", "pennants", "islets"] as const;

export function addScenery(
  builder: AuraSceneBuilder,
  addBatch: (id: string, batch: Batch, spec: CustomSpec) => void,
  programs: SceneryPrograms,
  segments: number,
  edgeX: number
): Scenery {
  const isletParts0 = isletParts();
  const keel = new Batch(keelMesh(), segments, null, CORRIDOR_BOUNDS);
  const dripPool = new RowPool(Math.ceil((segments + WINDOW_BACK) / DRIP_SPACING) + 1, DRIP_SPACING);
  const drips = new Batch(dripMesh(), dripPool.rows.length, [1, 1, 1], CORRIDOR_BOUNDS);
  const lampPool = new RowPool(Math.ceil((segments + WINDOW_BACK) / LAMP_SPACING) + 1, LAMP_SPACING);
  const isletPool = new RowPool(Math.ceil((segments + WINDOW_BACK) / ISLET_SPACING) + 1, ISLET_SPACING);
  const posts = new Batch(postMesh(), lampPool.rows.length, [1, 1, 1], CORRIDOR_BOUNDS);
  const bulbs = new Batch(bulbMesh(), lampPool.rows.length, [1, 1, 1], CORRIDOR_BOUNDS);
  const pennants = new Batch(pennantMesh(), lampPool.rows.length * PENNANTS_PER_SPAN, [1, 1, 1], CORRIDOR_BOUNDS);
  const islets = new Batch(isletParts0.mesh, isletPool.rows.length, isletParts0.tone, CORRIDOR_BOUNDS);
  const clouds = new Batch(puffMesh(), CLOUDS_PER_TILE * 3, [1, 1, 1], SKY_LAYER_BOUNDS);
  const horizon = new Batch(puffMesh(), HORIZON_PUFFS + HIGH_PUFFS, [1, 1, 1], SKY_LAYER_BOUNDS);
  const floor = new Batch(cylinderMesh(1, 0.02, 40), 1, [1, 1, 1], SKY_LAYER_BOUNDS);

  addBatch("cloud-floor", floor, programs.far);
  addBatch("horizon", horizon, programs.far);
  addBatch("clouds", clouds, programs.cloud);
  addBatch("keel", keel, programs.keel);
  addBatch("drips", drips, programs.toonTone);
  addBatch("posts", posts, programs.toonTone);
  addBatch("bulbs", bulbs, programs.glow);
  addBatch("pennants", pennants, programs.toonTone);
  addBatch("islets", islets, programs.toonTone);

  // Multi-material Street-Sport Ink Arena sideline boulevard belts + translucent physical sight-glasses.
  const arenaBelts = createTurfArenaSidelineBelts();
  for (const belt of arenaBelts) {
    builder.add(belt.opaqueNode);
    builder.add(belt.glassNode);
  }

  // Consolidate all 14 backdrop islands & balloons into 6 procedural GPU-instanced nodes (zero `.glb` assets).
  const instancedKinds = createTurfBackdropIslandNodes(PIECES, ASSET_KINDS, SPAN, NEAR);
  for (const item of instancedKinds) {
    builder.add(item.node);
  }

  /* static sunlit cloud layers: written once */
  const cloudWhite: Rgb = [1, 1, 1];
  const cloudCream = hexToLinear("#fff6e8");
  const cloudAzure = hexToLinear("#dcefff");
  const cloudSky = hexToLinear("#cbe6ff");
  const tints = [cloudWhite, cloudCream, cloudAzure, cloudSky];
  for (let t = 0; t < 3; t++) {
    for (let k = 0; k < CLOUDS_PER_TILE; k++) {
      const i = t * CLOUDS_PER_TILE + k;
      const side = k % 2 === 0 ? -1 : 1;
      const x = side * (6 + hash(k, 1) * 46);
      const y = -7.5 - hash(k, 2) * 5;
      const z = -(k / CLOUDS_PER_TILE) * CLOUD_TILE - t * CLOUD_TILE;
      const s = 2.2 + hash(k, 3) * 2.6;
      clouds.place(i, x, y, z, hash(k, 4) * 6.28, s * 1.3, s * 0.62, s);
      clouds.setTone(i, tints[k % tints.length]!);
    }
  }
  for (let k = 0; k < HORIZON_PUFFS; k++) {
    const a = -Math.PI / 2 + (k / HORIZON_PUFFS - 0.5) * Math.PI * 1.25;
    const r = 250 + hash(k, 9) * 50;
    const s = 14 + hash(k, 10) * 16;
    horizon.place(k, Math.cos(a) * r, -16 + hash(k, 11) * 12, Math.sin(a) * r, a, s * 1.6, s * 0.7, s);
    horizon.setTone(k, tints[(k + 1) % tints.length]!);
  }
  for (let k = 0; k < HIGH_PUFFS; k++) {
    const a = -Math.PI / 2 + (k / (HIGH_PUFFS - 1) - 0.5) * Math.PI * 0.9;
    const r = 210 + hash(k, 21) * 60;
    const s = 9 + hash(k, 22) * 9;
    horizon.place(HORIZON_PUFFS + k, Math.cos(a) * r, 34 + hash(k, 23) * 34, Math.sin(a) * r, a, s * 2.2, s * 0.45, s);
    horizon.setTone(HORIZON_PUFFS + k, k % 2 === 0 ? cloudWhite : cloudCream);
  }
  floor.place(0, 0, -22, -120, 0, 340, 1, 340);
  floor.setTone(0, hexToLinear("#bfe3ff"));

  let staticFlushed = false;

  function placeSegment(i: number, row: number): void {
    const z = -row - 0.5;
    if (row < 0) { keel.collapse(i); return; }
    keel.place(i, 0, -0.3, z, 0, 1, 1, 1);
    const paint = hexToLinear(paintColorFor(row));
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1;
      if (row % DRIP_SPACING === 0) {
        const h = hash(row, side + 5);
        const d = dripPool.slot(row, side);
        dripPool.rows[d] = row;
        if (h < 0.66) {
          drips.place(d, sx * (edgeX - 0.05), -0.25, z + (h - 0.33), 0, 1, 0.6 + h * 2.4, 1);
          drips.setTone(d, paint);
        } else drips.collapse(d);
      }
      if (row % LAMP_SPACING === 0) {
        const lamp = lampPool.slot(row, side);
        const lampYaw = sx < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        lampPool.rows[lamp] = row;
        posts.place(lamp, sx * (edgeX + 0.05), 0.06, z, lampYaw, 1, 1, 1);
        posts.setTone(lamp, hexToLinear(LOOK.roadEdge));
        bulbs.place(lamp, sx * (edgeX + 0.05), 0.06, z, lampYaw, 1, 1, 1);
        bulbs.setTone(lamp, hexToLinear(LOOK.paintColors[(row / LAMP_SPACING + side) % LOOK.paintColors.length] as string));
        for (let k = 0; k < PENNANTS_PER_SPAN; k++) {
          const t = (k + 0.5) / PENNANTS_PER_SPAN;
          const sag = 0.55 * 4 * t * (1 - t);
          const pz = z - t * LAMP_SPACING;
          const pi = lamp * PENNANTS_PER_SPAN + k;
          pennants.place(pi, sx * (edgeX + 0.05), 2.45 - sag, pz, Math.PI / 2, 1, 1, 1);
          pennants.setTone(pi, hexToLinear(LOOK.paintColors[(k + row / LAMP_SPACING) % LOOK.paintColors.length] as string));
        }
      }
    }
  }

  function placeIslet(row: number, side: number, x: number, sc: number): void {
    const slot = isletPool.slot(row, side);
    isletPool.rows[slot] = row;
    islets.place(slot, x, -0.35, -row - 0.5, sc * 2.1, sc * 1.35, sc * 1.1, sc * 1.35);
  }

  function retire(distance: number): void {
    const lo = distance - WINDOW_BACK, hi = distance + segments + 5;
    for (let s = 0; s < lampPool.rows.length; s++) {
      const r = lampPool.rows[s]!;
      if (Number.isNaN(r) || (r >= lo && r <= hi)) continue;
      lampPool.rows[s] = Number.NaN;
      posts.collapse(s); bulbs.collapse(s);
      for (let k = 0; k < PENNANTS_PER_SPAN; k++) pennants.collapse(s * PENNANTS_PER_SPAN + k);
    }
    for (let s = 0; s < dripPool.rows.length; s++) {
      const r = dripPool.rows[s]!;
      if (Number.isNaN(r) || (r >= lo && r <= hi)) continue;
      dripPool.rows[s] = Number.NaN;
      drips.collapse(s);
    }
    for (let s = 0; s < isletPool.rows.length; s++) {
      const r = isletPool.rows[s]!;
      if (Number.isNaN(r) || (r >= lo && r <= hi)) continue;
      isletPool.rows[s] = Number.NaN;
      islets.collapse(s);
    }
  }

  function update(node: (id: string) => NodeHandle, roadZ: number, distance: number, elapsed: number, reduced: boolean): void {
    retire(distance);
    for (const id of SCENERY_BATCH_IDS) node(id).setPosition(0, 0, roadZ);
    node("clouds").setPosition(0, 0, ((roadZ % CLOUD_TILE) + CLOUD_TILE) % CLOUD_TILE);
    const arenaBaseZ = (((roadZ - 24) % ARENA_BELT_SPAN) + ARENA_BELT_SPAN) % ARENA_BELT_SPAN + 24;
    for (const belt of arenaBelts) {
      const bz = arenaBaseZ - belt.tileIndex * ARENA_BELT_SPAN;
      node(belt.opaqueId).setPosition(0, 0, bz);
      node(belt.glassId).setPosition(0, 0, bz);
    }
    const beltZ = (((distance * 0.55) % SPAN) + SPAN) % SPAN;
    const t = reduced ? 0 : elapsed;
    for (const item of instancedKinds) {
      const amp = item.kind === "balloon" ? 0.48 : 0.22;
      const bob = Math.sin(t * 0.72 + item.phase) * amp;
      node(item.nodeId).setPosition(0, bob, beltZ);
    }
    keel.flush(node("keel"));
    drips.flush(node("drips"));
    posts.flush(node("posts"));
    bulbs.flush(node("bulbs"));
    pennants.flush(node("pennants"));
    islets.flush(node("islets"));
    if (!staticFlushed) {
      clouds.flush(node("clouds"));
      horizon.flush(node("horizon"));
      floor.flush(node("cloud-floor"));
      staticFlushed = true;
    }
  }

  return {
    placeSegment, placeIslet, update,
    batches: [keel, drips, posts, bulbs, pennants, islets, clouds, horizon, floor]
  };
}
