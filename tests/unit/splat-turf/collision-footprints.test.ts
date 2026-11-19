/**
 * Splat Turf "nothing drives through anything" contract, derived from the constants world.ts / scenery.ts / art/idol.ts
 * draw with and the ones sim.ts collides with:
 * - every hazard's sim footprint matches its visual bounds (rover vs rival eraser kart, solvent strips);
 * - no solid decor (Idol set pieces, roadside buckets + islets, lamp posts, finish-gantry legs) intrudes into the
 *   envelope the rover and the rival karts can occupy.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../../apps/showcase-splat-turf/src/sim";
import { BALL_RADIUS, stripMesh } from "../../../apps/showcase-splat-turf/src/meshes";
import { BOT_STEER_YAW, EDGE_X, PROP_SPACING, roadsidePropPose } from "../../../apps/showcase-splat-turf/src/world";
import { ISLET_RADIUS, ISLET_SPREAD, LAMP_SPACING } from "../../../apps/showcase-splat-turf/src/scenery";
import { turfGooseneckPostMesh } from "../../../apps/showcase-splat-turf/src/art/proceduralModels";
import {
  ARENA_LAYOUT,
  FINISH_GANTRY_SCALE,
  HERO_ROVER_OFFSET,
  IDOL_DIMS,
  PAINT_BUCKET_KEYS,
  RIVAL_BRUSH_LOCAL,
  TURF_IDOL_ASSETS
} from "../../../apps/showcase-splat-turf/src/art/idol";

/** Curb rail profile half-width (`turfArenaCurbWallMesh`, x -0.17..0.17 around EDGE_X). */
const CURB_HALF = 0.17;
const CURB_INNER = EDGE_X - CURB_HALF;
const CURB_OUTER = EDGE_X + CURB_HALF;
/** Widest |x| the rover's footprint reaches (lane clamp + half-width). */
const ROVER_ENVELOPE = CONFIG.LANE_LIMIT + CONFIG.ROVER_HALF_WIDTH;
/** Rover + seated driver stay below this height; anything overhead above it (lamp hoods, pennants, gantry beam) clears. */
const HEAD_CLEARANCE = 2.0;

/** Lateral extent of a box (half-width hw, half-depth hd, centred at local z = cz) yawed by `yaw`, toward +x. */
const yawedExtent = (hw: number, hd: number, cz: number, yaw: number): number =>
  hw * Math.cos(yaw) + hd * Math.abs(Math.sin(yaw)) + cz * Math.sin(yaw);

describe("splat turf hazard hitboxes match their visuals", () => {
  it("rover footprint = Idol hero kart + leading roller ball", () => {
    expect(CONFIG.ROVER_HALF_WIDTH).toBeCloseTo(Math.max(BALL_RADIUS, IDOL_DIMS.turfHeroKartShell[0] / 2), 1);
    expect(CONFIG.ROVER_HALF_WIDTH).toBeGreaterThanOrEqual(IDOL_DIMS.turfHeroKartShell[0] / 2);
    expect(CONFIG.ROVER_REACH_FRONT).toBeCloseTo(BALL_RADIUS, 2);
    expect(Math.abs(CONFIG.ROVER_REACH_BACK - (HERO_ROVER_OFFSET.z + IDOL_DIMS.turfHeroKartShell[2] / 2))).toBeLessThan(0.05);
  });

  it("eraser footprint = Idol rival kart shell + scrub brush, across its steer yaw", () => {
    const brushHw = IDOL_DIMS.turfScrubBrush[0] / 2, brushHd = IDOL_DIMS.turfScrubBrush[2] / 2;
    const shellHw = IDOL_DIMS.turfRivalKartShell[0] / 2, shellHd = IDOL_DIMS.turfRivalKartShell[2] / 2;
    for (const yaw of [0, BOT_STEER_YAW, -BOT_STEER_YAW]) {
      // Visual lateral reach on the nose side (+x when yaw > 0) and the tail side.
      const lead = Math.max(yawedExtent(brushHw, brushHd, RIVAL_BRUSH_LOCAL.z, Math.abs(yaw)), yawedExtent(shellHw, shellHd, 0, Math.abs(yaw)));
      const trail = Math.max(yawedExtent(brushHw, brushHd, -RIVAL_BRUSH_LOCAL.z, Math.abs(yaw)), yawedExtent(shellHw, shellHd, 0, Math.abs(yaw)));
      for (const visual of [lead, trail]) expect(Math.abs(CONFIG.ERASER_HALF_WIDTH - visual), `yaw ${yaw}`).toBeLessThanOrEqual(0.12);
    }
    expect(Math.abs(CONFIG.ERASER_REACH_FRONT - (RIVAL_BRUSH_LOCAL.z + brushHd))).toBeLessThan(0.05);
    expect(Math.abs(CONFIG.ERASER_REACH_BACK - shellHd)).toBeLessThan(0.05);
  });

  it("solvent strip mesh covers exactly its sim column and SOLVENT_LENGTH rows", () => {
    const p = stripMesh().positions;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i]!); maxX = Math.max(maxX, p[i]!);
      minZ = Math.min(minZ, p[i + 2]!); maxZ = Math.max(maxZ, p[i + 2]!);
    }
    expect(Math.abs(maxX - minX - CONFIG.CELL_METERS)).toBeLessThan(0.05);
    expect(maxZ - minZ).toBeCloseTo(CONFIG.SOLVENT_LENGTH, 6);
    // world.ts centres a strip at x = col - LANE_LIMIT; sim.ts maps lane x to column floor(x + LANE_LIMIT + 0.5).
    for (let col = 0; col < CONFIG.GRID_COLS; col++) {
      const cx = col - CONFIG.LANE_LIMIT;
      for (const x of [cx + minX + 0.03, cx, cx + maxX - 0.03]) expect(Math.floor(x + CONFIG.LANE_LIMIT + 0.5)).toBe(col);
    }
  });
});

describe("splat turf decor stays out of the drivable envelope", () => {
  it("rover and rival karts fit between the curbs", () => {
    expect(ROVER_ENVELOPE).toBeLessThanOrEqual(CURB_INNER);
    expect(CONFIG.LANE_LIMIT + CONFIG.ERASER_HALF_WIDTH).toBeLessThanOrEqual(CURB_INNER);
  });

  it("Idol arena set pieces sit outside the curbs (plan half-diagonal, any yaw)", () => {
    for (const a of ARENA_LAYOUT) {
      const b = TURF_IDOL_ASSETS[a.key].bounds;
      const inner = a.x - Math.hypot(b[0], b[2]) / 2;
      expect(inner, `${a.key} at ${a.side * a.x},${a.z}`).toBeGreaterThan(CURB_OUTER + 0.5);
    }
  });

  it("roadside paint buckets and their islets sit outside the curbs on every row", () => {
    const bucketHalf = Math.max(...PAINT_BUCKET_KEYS.map((k) => Math.hypot(TURF_IDOL_ASSETS[k].bounds[0], TURF_IDOL_ASSETS[k].bounds[2]) / 2));
    let placed = 0;
    for (let row = 0; row < CONFIG.RUN_LENGTH + CONFIG.POOL_SEGMENTS; row++) {
      for (const side of [0, 1]) {
        const p = roadsidePropPose(row, side);
        if (!p) continue;
        placed++;
        const inner = Math.abs(p.x) - Math.max(bucketHalf * p.sc, ISLET_RADIUS * ISLET_SPREAD * p.sc);
        expect(inner, `row ${row} side ${side}`).toBeGreaterThan(CURB_OUTER + 0.3);
      }
    }
    expect(placed).toBeGreaterThan(((CONFIG.RUN_LENGTH / PROP_SPACING) * 2) * 0.9);
  });

  it("lamp posts stand on the curb line clear of the rover below head height", () => {
    // scenery.ts: post at x = ±(EDGE_X + 0.05), yaw ∓90 deg, so local +z (the hood overhang) points at the road.
    const p = turfGooseneckPostMesh().positions;
    let innerLow = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i + 1]! + 0.06 >= HEAD_CLEARANCE) continue;
      innerLow = Math.min(innerLow, EDGE_X + 0.05 - p[i + 2]!);
    }
    expect(innerLow).toBeGreaterThan(ROVER_ENVELOPE);
    expect(LAMP_SPACING).toBeGreaterThan(0);
  });

  it("finish gantry legs stand outside the curbs (measured on the shipped GLB)", () => {
    const pts = glbWorldPositions(readFileSync(new URL(`../../../public${TURF_IDOL_ASSETS.turfFinishGantry.url}`, import.meta.url)));
    expect(pts.length).toBeGreaterThan(1000);
    let inner = Infinity;
    for (const [x, y] of pts) {
      if (y * FINISH_GANTRY_SCALE[1] >= HEAD_CLEARANCE + 1) continue; // the scoreboard beam spans overhead
      inner = Math.min(inner, Math.abs(x * FINISH_GANTRY_SCALE[0]));
    }
    expect(inner).toBeGreaterThan(CURB_OUTER);
  });
});

/** POSITION vertices of every mesh in a GLB, in the scene's world frame (node TRS / matrix hierarchy applied). */
function glbWorldPositions(buf: Buffer): [number, number, number][] {
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const bin = 20 + jsonLen + 8;
  type Node = { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] };
  const out: [number, number, number][] = [];
  const local = (n: Node): number[] => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale ?? [1, 1, 1];
    const [tx, ty, tz] = n.translation ?? [0, 0, 0];
    return [
      (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      tx, ty, tz, 1
    ];
  };
  const mul = (a: number[], b: number[]): number[] => {
    const r = new Array<number>(16).fill(0);
    for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) for (let k = 0; k < 4; k++) r[c * 4 + rr]! += a[k * 4 + rr]! * b[c * 4 + k]!;
    return r;
  };
  const visit = (idx: number, parent: number[]): void => {
    const n = gltf.nodes[idx] as Node;
    const m = mul(parent, local(n));
    if (n.mesh !== undefined) {
      for (const prim of gltf.meshes[n.mesh].primitives) {
        const acc = gltf.accessors[prim.attributes.POSITION];
        const bv = gltf.bufferViews[acc.bufferView];
        expect(acc.componentType).toBe(5126);
        const stride = bv.byteStride ?? 12;
        for (let i = 0; i < acc.count; i++) {
          const o = bin + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0) + i * stride;
          const x = buf.readFloatLE(o), y = buf.readFloatLE(o + 4), z = buf.readFloatLE(o + 8);
          out.push([
            m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
            m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
            m[2]! * x + m[6]! * y + m[10]! * z + m[14]!
          ]);
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, identity);
  return out;
}
