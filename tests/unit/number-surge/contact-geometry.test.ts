import { describe, expect, it } from "vitest";
import {
  bossWallSawRollerHazardMeshData,
  buildHazardBuzzsawSpec,
  buildMergedHighwayPylonSpec,
  buildSleekTrackCurbGlowSpec,
  buildSleekTrackCurbSpec,
  highwayGateGantryFrameMeshData
} from "../../../apps/showcase-number-surge/src/art/proceduralModels";
import { DIMS } from "../../../apps/showcase-number-surge/src/meshes";
import { ROADSIDE, ROADSIDE_SPAN, roadsidePose } from "../../../apps/showcase-number-surge/src/roadside";
import { ISLES, ROWS, islePose } from "../../../apps/showcase-number-surge/src/scenery";
import { CONFIG, IDLE, NumberSurgeSim } from "../../../apps/showcase-number-surge/src/sim";
import {
  BOSS_GUARDS,
  GATE_FRAME_SIDES,
  SHIELD_RADIUS,
  WALL_ASSEMBLY_FRONT,
  WALL_MESH_FRONT,
  WALL_SAW,
  gateFrameYaw,
  guardFrontZ,
  wallVisualLead,
  wallWorldZ
} from "../../../apps/showcase-number-surge/src/world";

/**
 * Pass-through audit: the ball (radius BALL_RADIUS) sweeps |x| <= LANE_LIMIT + BALL_RADIUS. Decor must stay outside that
 * corridor; gate gantries may only put solids there above the ball; the boss wall (the sim's only blocking hazard,
 * road-wide, resolving at wall.z = 0) must be drawn so its front meets the ball's front exactly when the sim resolves it.
 */
const CORRIDOR_HALF = CONFIG.LANE_LIMIT + DIMS.BALL_RADIUS;
const MARGIN = 0.25;
const BALL_TOP = DIMS.BALL_RADIUS * 2;

function bounds(p: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[i + k]!);
      max[k] = Math.max(max[k]!, p[i + k]!);
    }
  }
  return { min, max };
}

/** Gate frame vertices in road space (x, y) as world.ts places them: gate.x plus yaw about Y. */
function placedFrame(sides: readonly (-1 | 1)[], gateX: number, yaw: number): [number, number][] {
  const m = highwayGateGantryFrameMeshData(sides);
  const out: [number, number][] = [];
  for (let i = 0; i < m.positions.length; i += 3) {
    const lx = m.positions[i]!;
    const lz = m.positions[i + 2]!;
    out.push([gateX + lx * Math.cos(yaw) + lz * Math.sin(yaw), m.positions[i + 1]!]);
  }
  return out;
}

describe("number surge contact geometry (visual == sim hitbox)", () => {
  it("no decor footprint intersects the playable corridor", () => {
    for (const p of ROADSIDE) {
      for (let travelled = 0; travelled < ROADSIDE_SPAN * 2; travelled += 3.7) {
        const pose = roadsidePose(p, travelled, travelled * 0.1);
        const halfWidth = p.kind === "nsFloatingDice" ? p.height * 1.25 : p.kind === "nsNumeralSeven" ? p.height * 0.29 : p.height * 0.32;
        expect(Math.abs(pose.x) - halfWidth * pose.scale, p.id).toBeGreaterThan(CORRIDOR_HALF + MARGIN);
      }
    }
    for (const isle of ISLES) {
      const pose = islePose(isle, 0, 0);
      expect(Math.abs(pose.x) - isle.r * 2, isle.id).toBeGreaterThan(CORRIDOR_HALF + MARGIN);
    }
    for (const row of ROWS) expect(row.x0 - row.wMax / 2).toBeGreaterThan(CORRIDOR_HALF + MARGIN);
    for (const spec of [buildSleekTrackCurbSpec(), buildSleekTrackCurbGlowSpec()]) {
      for (let i = 0; i < spec.positions.length; i += 3) expect(Math.abs(spec.positions[i]!)).toBeGreaterThan(CORRIDOR_HALF + MARGIN);
    }
    // Highway pylons hang strictly beneath the deck.
    expect(bounds(buildMergedHighwayPylonSpec().positions).max[1]!).toBeLessThan(0);
  });

  it("gate gantries put no solid where the ball can roll (only the outer stanchion is built)", () => {
    for (const gateX of CONFIG.GATE_LANES) {
      for (const [x, y] of placedFrame(GATE_FRAME_SIDES, gateX, gateFrameYaw(gateX))) {
        if (Math.abs(x) <= CORRIDOR_HALF + MARGIN) expect(y, `gate ${gateX} vertex at x ${x.toFixed(2)}`).toBeGreaterThan(BALL_TOP + 1);
      }
      // the outer stanchion really is outboard of its gate
      const low = placedFrame(GATE_FRAME_SIDES, gateX, gateFrameYaw(gateX)).filter(([, y]) => y < BALL_TOP);
      expect(low.length).toBeGreaterThan(0);
      for (const [x] of low) expect(Math.sign(x)).toBe(Math.sign(gateX));
    }
    // Regression: the old twin-stanchion gantry stood an inner post at |x| ~0.22, right in the ball's path.
    const twin = placedFrame([-1, 1], CONFIG.GATE_LANES[0], 0);
    expect(twin.some(([x, y]) => Math.abs(x) < CORRIDOR_HALF && y < BALL_TOP)).toBe(true);
  });

  it("boss-wall visual bounds match the sim's road-wide wall hitbox", () => {
    const wall = bounds(bossWallSawRollerHazardMeshData().positions);
    expect(wall.min[0]!).toBeLessThan(-CORRIDOR_HALF);
    expect(wall.max[0]!).toBeGreaterThan(CORRIDOR_HALF);
    expect(wall.min[1]!).toBeLessThan(0.05);
    expect(wall.max[1]!).toBeGreaterThan(BALL_TOP);
    expect(wall.max[2]!).toBeCloseTo(WALL_MESH_FRONT, 3);
    expect(bounds(buildHazardBuzzsawSpec().positions).max[2]!).toBeCloseTo(WALL_SAW.halfDepth, 3);
    for (const g of BOSS_GUARDS) expect(guardFrontZ(g)).toBeLessThanOrEqual(WALL_ASSEMBLY_FRONT);
    expect(WALL_ASSEMBLY_FRONT).toBeGreaterThanOrEqual(WALL_MESH_FRONT);
    // Front of the assembly meets the ball (or shield) front exactly at the sim's resolve plane.
    for (const shield of [false, true]) {
      const reach = shield ? SHIELD_RADIUS : DIMS.BALL_RADIUS;
      expect(wallWorldZ(0, 0, shield) + WALL_ASSEMBLY_FRONT).toBeCloseTo(-reach, 9);
      expect(wallWorldZ(-0.4, 0, shield)).toBeCloseTo(wallWorldZ(0, 0, shield), 9);
      expect(wallVisualLead(shield)).toBeCloseTo(WALL_ASSEMBLY_FRONT + reach, 9);
    }
  });

  it("over a real run the ball never sinks into a boss wall and stops in contact when it fails", () => {
    const sim = new NumberSurgeSim(3);
    sim.advance({ ...IDLE, start: true });
    let failed = false;
    for (let step = 0; step < 60 * 90 && !failed; step++) {
      const wallsBefore = sim.o.walls.map((w) => ({ active: w.active, z: w.z }));
      sim.advance(IDLE);
      const reach = sim.o.shieldActive ? SHIELD_RADIUS : DIMS.BALL_RADIUS;
      for (const w of sim.o.walls) {
        if (!w.active) continue;
        const front = wallWorldZ(w.z, 0, sim.o.shieldActive) + WALL_ASSEMBLY_FRONT;
        expect(front).toBeLessThanOrEqual(-reach + 1e-9);
      }
      if (sim.o.phase === "bursting") {
        failed = true;
        const hit = sim.o.walls.find((w) => w.active && w.z <= 0)!;
        expect(hit).toBeDefined();
        expect(wallWorldZ(hit.z, 0, sim.o.shieldActive) + WALL_ASSEMBLY_FRONT).toBeCloseTo(-reach, 9);
        // One step earlier the wall was still ahead of the contact plane.
        expect(wallsBefore.some((w) => w.active && w.z > 0)).toBe(true);
      }
    }
    expect(failed).toBe(true);
  });
});
