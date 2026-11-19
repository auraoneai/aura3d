import { describe, expect, it } from "vitest";
import {
  CONFIG,
  IDLE,
  ShapeShiftSim,
  gateHalfWidth,
  judgeRow,
  type Hole
} from "../../../apps/showcase-shape-shift-sprint/src/sim";
import {
  ROAD_DIMS,
  WALL_DIMS,
  playerBodyExtents,
  wallCellMesh,
  wallHoleExtents
} from "../../../apps/showcase-shape-shift-sprint/src/meshes";
import { MESHY_PIECES, PIECES, islandMesh, puffMesh } from "../../../apps/showcase-shape-shift-sprint/src/scenery";
import { SCROLL_BOUNDS, gateDive, gateFitScale, nearestLaneIndex, wallRetractY } from "../../../apps/showcase-shape-shift-sprint/src/world";
import {
  buildBridgeViaductStationNode,
  buildFloatingPrismClustersNode,
  buildHorizonStadiumPylonsNode,
  buildShapeGatePortalNode
} from "../../../apps/showcase-shape-shift-sprint/src/art/proceduralModels";

/**
 * Owner complaint: runners ghost through solid-looking objects. Every solid thing in the corridor must either be a
 * hazard whose visual matches the sim's hit test (the shape walls), or sit outside the runner's reach.
 */

const SHAPES = [0, 1, 2] as const;
/** Widest the runner's body ever reaches sideways: lane clamp + widest body half-width at the scale cap. */
const RUNNER_REACH = CONFIG.LANE_HALF_WIDTH + Math.max(...SHAPES.map((s) => playerBodyExtents(s).halfWidth)) * CONFIG.SCALE_CAP;
const DECOR_MARGIN = 0.04;
/** Anything below this height is a flush deck decal (inlays, boost chevrons) or under the road surface. */
const DECK_DECAL_Y = 0.06;

interface JsonNode {
  readonly name?: string;
  readonly geometry?: { readonly positions?: Float32Array };
  readonly instances?: readonly { readonly position?: readonly number[]; readonly scale?: number | readonly number[] }[];
  readonly children?: readonly JsonNode[];
}

function walk(n: JsonNode, out: JsonNode[] = []): JsonNode[] {
  out.push(n);
  for (const c of n.children ?? []) walk(c, out);
  return out;
}

/** Inner-most |x| of every vertex standing above the deck (the part a runner could run into). */
function innerSolidX(root: JsonNode): number {
  let inner = Infinity;
  for (const n of walk(root)) {
    const p = n.geometry?.positions;
    if (!p) continue;
    for (let i = 0; i < p.length; i += 3) if (p[i + 1]! > DECK_DECAL_Y) inner = Math.min(inner, Math.abs(p[i]!));
  }
  expect(Number.isFinite(inner), `${root.name} has standing geometry`).toBe(true);
  return inner;
}

function meshRadiusXZ(positions: ArrayLike<number>): number {
  let r = 0;
  for (let i = 0; i < positions.length; i += 3) r = Math.max(r, Math.hypot(positions[i]!, positions[i + 2]!));
  return r;
}

const rowAt = (sim: ShapeShiftSim, shapes: readonly [number, number, number]) => {
  const row = sim.rows[0]!;
  row.z = -0.1;
  row.holes = CONFIG.LANES.map((laneX, i) => ({ laneX, shapeIndex: shapes[i]! }));
  return row;
};

const running = (seed: number): ShapeShiftSim => {
  const sim = new ShapeShiftSim(seed);
  sim.advance({ ...IDLE, start: true });
  sim.tokens = [];
  return sim;
};

describe("shape shift sprint: shape walls are hazards whose visual matches the sim hit test", () => {
  it("the sim's opening per shape is the wall cell's cutout (measured from the mesh vertices)", () => {
    const hw = WALL_DIMS.cellWidth / 2;
    for (const s of SHAPES) {
      const pos = wallCellMesh(s).positions;
      let maxX = 0, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i]!, y = pos[i + 1]!;
        const onOuterBox = Math.abs(Math.abs(x) - hw) < 1e-6 || Math.abs(y) < 1e-6 || Math.abs(y - WALL_DIMS.cellHeight) < 1e-6;
        if (onOuterBox) continue; // cutout tunnel / annulus inner ring only
        maxX = Math.max(maxX, Math.abs(x));
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const hole = wallHoleExtents(s);
      expect(gateHalfWidth(s)).toBe(hole.halfWidth);
      // 48-segment mesh outline vs the finely sampled outline: within a couple of centimetres.
      expect(Math.abs(maxX - hole.halfWidth), `shape ${s} half-width`).toBeLessThan(0.02);
      expect(Math.abs(minY - hole.bottom), `shape ${s} bottom`).toBeLessThan(0.02);
      expect(Math.abs(maxY - hole.top), `shape ${s} top`).toBeLessThan(0.02);
      // There is solid wall between neighbouring openings and beyond the outer ones.
      expect(hole.halfWidth).toBeLessThan(hw);
    }
  });

  it("the wall row tiles the whole steerable span, so the runner cannot go around it", () => {
    for (let i = 1; i < CONFIG.LANES.length; i++) {
      expect(CONFIG.LANES[i]! - CONFIG.LANES[i - 1]!).toBeCloseTo(WALL_DIMS.cellWidth, 9);
    }
    expect(CONFIG.LANES[CONFIG.LANES.length - 1]! + WALL_DIMS.cellWidth / 2).toBeGreaterThan(CONFIG.LANE_HALF_WIDTH);
    expect(CONFIG.LANES[0]! - WALL_DIMS.cellWidth / 2).toBeLessThan(-CONFIG.LANE_HALF_WIDTH);
  });

  it("every steerable x: the sim scores a fit only where the runner's centre is in the matching visible opening", () => {
    const holes: Hole[] = CONFIG.LANES.map((laneX, i) => ({ laneX, shapeIndex: i }));
    for (let x = -CONFIG.LANE_HALF_WIDTH; x <= CONFIG.LANE_HALF_WIDTH + 1e-9; x += 0.01) {
      for (const shape of SHAPES) {
        for (const wildcard of [false, true]) {
          const visible = holes.find((h) => Math.abs(x - h.laneX) < wallHoleExtents(h.shapeIndex).halfWidth);
          const expected = visible !== undefined && (wildcard || visible.shapeIndex === shape);
          expect(judgeRow(holes, x, shape, wildcard).fits, `x=${x.toFixed(2)} shape=${shape} wildcard=${wildcard}`).toBe(expected);
        }
      }
    }
  });

  it("running into a mullion or flank costs a life (normal hit response), just inside the opening scores", () => {
    for (const shape of SHAPES) {
      const opening = gateHalfWidth(shape);
      const edgeIn = running(40 + shape);
      edgeIn.o.shapeIndex = shape;
      rowAt(edgeIn, [(shape + 1) % 3, shape, (shape + 2) % 3]);
      edgeIn.o.laneOffset = edgeIn.ye = opening * 0.97;
      edgeIn.advance(IDLE);
      expect(edgeIn.o.matches, `shape ${shape} inside`).toBe(1);
      expect(edgeIn.o.lives).toBe(CONFIG.MAX_LIVES);

      const mullion = running(50 + shape);
      mullion.o.shapeIndex = shape;
      mullion.o.wildcardTimer = 3; // even a wildcard cannot pass through solid wall
      const row = rowAt(mullion, [(shape + 1) % 3, shape, (shape + 2) % 3]);
      mullion.o.laneOffset = mullion.ye = Math.min(opening * 1.05, CONFIG.LANES[1]! + WALL_DIMS.cellWidth / 2);
      mullion.advance(IDLE);
      expect(mullion.o.matches, `shape ${shape} mullion`).toBe(0);
      expect(mullion.o.lives).toBe(CONFIG.MAX_LIVES - 1);
      expect(row.matchedLane).toBe(-1);
      // The struck cell (the one that breaks in the world) is the centre lane's.
      expect(nearestLaneIndex(row, mullion.player.x)).toBe(1);
    }
  });

  it("the gate dive puts a fitting body inside its opening (not through the sill) at every runner scale", () => {
    for (const s of SHAPES) {
      const hole = wallHoleExtents(s);
      const body = playerBodyExtents(s);
      expect(gateFitScale(s)).toBeGreaterThan(0.6);
      for (let scale = CONFIG.SCALE_FLOOR; scale <= CONFIG.SCALE_CAP + 1e-9; scale += 0.05) {
        const overlapDepth = WALL_DIMS.thickness / 2 + body.halfWidth * scale;
        for (const d of [0, overlapDepth * 0.5, overlapDepth]) {
          const dive = gateDive(s, scale, d);
          expect(dive.weight, `shape ${s} scale ${scale} d ${d}`).toBe(1);
          expect(dive.scale).toBeLessThanOrEqual(scale + 1e-12);
          expect(body.halfWidth * dive.scale).toBeLessThan(hole.halfWidth);
          expect(dive.centerY + body.bottom * dive.scale).toBeGreaterThan(hole.bottom);
          expect(dive.centerY + body.top * dive.scale).toBeLessThan(hole.top);
        }
        expect(gateDive(s, scale, overlapDepth + 0.05 + 1.61).weight).toBe(0);
      }
    }
  });
});

describe("shape shift sprint: no decor stands in the runner's corridor", () => {
  it("the corridor reach is inside the road + curb and every decor piece stands outside it", () => {
    expect(RUNNER_REACH).toBeLessThan(ROAD_DIMS.width / 2 + 0.32 + 0.1);
    const limit = RUNNER_REACH + DECOR_MARGIN;

    // Gate portal bollards (deck lane inlays are flush decals below DECK_DECAL_Y).
    for (const v of [0, 1]) {
      expect(innerSolidX(buildShapeGatePortalNode(`p${v}`, v).toJSON() as unknown as JsonNode), `portal ${v}`).toBeGreaterThan(limit);
    }
    // Viaduct stations: column and trusses are under the deck, boost chevrons flush; monoliths stand off the road.
    for (let i = 0; i < 6; i++) {
      expect(innerSolidX(buildBridgeViaductStationNode(`v${i}`, i).toJSON() as unknown as JsonNode), `viaduct ${i}`).toBeGreaterThan(limit);
    }
    // GPU-drifted parallax islands and puffs.
    for (const p of PIECES) {
      const m = p.variant === "puff" ? puffMesh(p.z0 | 0).mesh : islandMesh(p.variant, Math.round(p.z0) % 7).mesh;
      expect(Math.abs(p.x) - meshRadiusXZ(m.positions) * p.scale, p.id).toBeGreaterThan(limit);
    }
    // Idol landmark castles and towers (size = max dimension, so half of it bounds the footprint).
    for (const p of MESHY_PIECES) expect(Math.abs(p.x) - p.size / 2, p.id).toBeGreaterThan(limit);
    // Instanced horizon pylons and floating prism clusters.
    for (const node of [buildHorizonStadiumPylonsNode(), buildFloatingPrismClustersNode()]) {
      const json = node.toJSON() as unknown as JsonNode;
      const r = meshRadiusXZ(json.geometry?.positions ?? []);
      expect(json.instances?.length ?? 0).toBeGreaterThan(0);
      for (const t of json.instances ?? []) {
        const s = typeof t.scale === "number" ? t.scale : Math.max(...((t.scale as readonly number[] | undefined) ?? [1]));
        expect(Math.abs(t.position![0]!) - r * s, json.name).toBeGreaterThan(limit);
      }
    }
  });
});

describe("passed walls never hide the runner from the chase camera", () => {
  it("stands until the runner is through, then sinks below the camera's sight line", () => {
    // Never moves while the row is ahead of (or still around) the runner: the hit test and the dive see a full wall.
    for (const d of [-20, -1, 0, WALL_DIMS.thickness]) expect(wallRetractY(d)).toBe(0);
    // ChaseCamera's lowest rig: 5 m above and 9 m behind the runner, looking at its centre (~0.55 m up).
    const eyeY = 5, eyeBack = 9, targetY = 0.55;
    for (let d = 2; d <= eyeBack; d += 0.25) {
      const sight = targetY + (eyeY - targetY) * (d / eyeBack);
      expect(WALL_DIMS.cellHeight + wallRetractY(d)).toBeLessThanOrEqual(sight + 1e-6);
    }
    // Fully retracted below the road surface well before the row reaches the camera.
    expect(WALL_DIMS.cellHeight + wallRetractY(eyeBack)).toBeLessThanOrEqual(0);
  });
});

describe("scrolling-frame batches stay inside their culling bounds for a long run", () => {
  it("covers walls, road and tokens at local z = z - scroll after an hour of play", () => {
    // Batches in the scrolling frame are placed at `z - sim.scroll`; a fixed corridor box culled every gate after ~420 m.
    const sim = new ShapeShiftSim(20261101);
    const scrollAfterHour = CONFIG.MAX_SPEED * 3600;
    for (const localZ of [-scrollAfterHour - 80, -scrollAfterHour + 10, 0]) {
      expect(localZ).toBeGreaterThanOrEqual(SCROLL_BOUNDS.min[2]);
      expect(localZ).toBeLessThanOrEqual(SCROLL_BOUNDS.max[2]);
    }
    expect(sim.scroll).toBe(0);
  });
});
