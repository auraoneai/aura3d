import { describe, expect, it } from "vitest";
import { BACKDROP_GROUPS, IDOL_BACKDROP_ASSETS } from "../../../apps/showcase-polarity-orbs/src/backdrop";
import { CORRIDOR_HARDWARE, crownPrismGemMesh, dipoleCollectorOrbMesh, heroGyroOrbMesh } from "../../../apps/showcase-polarity-orbs/src/art/proceduralModels";
import { BALL_RADIUS, DECK_WIDTH, GEM_RADIUS, ORB_RADIUS } from "../../../apps/showcase-polarity-orbs/src/meshes";
import { NEAR_DRESSING } from "../../../apps/showcase-polarity-orbs/src/scenery";
import { CONFIG, IDLE, PolarityOrbsSim, contactRadius } from "../../../apps/showcase-polarity-orbs/src/sim";

/**
 * Pass-through audit: decor never stands in the corridor the ball can reach, and every pickup / hazard the sim
 * resolves uses the same footprint the renderer draws (no hit from a gap, no orb sliding through the ball).
 */

/** Deck half-width plus the arena-bezel rail (placed at DECK_WIDTH / 2 + 0.15, profile half-width 0.19, world.ts). */
const CORRIDOR_EDGE = DECK_WIDTH / 2 + 0.15 + 0.19;
/** Widest lateral reach of the ball: lane limit plus the largest rendered radius. */
const BALL_REACH = CONFIG.LANE_LIMIT + BALL_RADIUS * CONFIG.SCALE_CAP;
/** Ball top, including the 0.18 m flip micro-hop (world.ts). */
const BALL_TOP = 2 * BALL_RADIUS * CONFIG.SCALE_CAP + 0.18;

const halfExtentX = (m: { positions: ArrayLike<number> }): number => {
  let max = 0;
  for (let i = 0; i < m.positions.length; i += 3) max = Math.max(max, Math.abs(m.positions[i] as number));
  return max;
};

describe("polarity-orbs decor stays out of the playable corridor", () => {
  it("the deck + rails contain every position the ball can reach", () => {
    expect(BALL_REACH).toBeLessThan(CORRIDOR_EDGE);
  });

  it("Idol backdrop bodies (any yaw) stand beyond the rail edge", () => {
    for (const g of BACKDROP_GROUPS) {
      const [bx, , bz] = IDOL_BACKDROP_ASSETS[g.kind].bounds as readonly [number, number, number];
      const halfDiagonal = Math.hypot(bx, bz) / 2;
      for (const t of g.transforms) {
        const inner = Math.abs(t.position[0]) - halfDiagonal * t.scale;
        expect(inner, `${g.id} at z=${t.position[2]}`).toBeGreaterThan(CORRIDOR_EDGE);
      }
    }
  });

  it("trackside bezels, busbars, insulators and flux-gate pedestals stand beyond the rail edge", () => {
    const { gate, bezel, bus } = CORRIDOR_HARDWARE;
    const inner: Record<string, number> = {
      "flux-gate pedestal": gate.spanR - gate.plinthR,
      "flux-gate girder foot": gate.spanR - gate.girderHalf,
      "arena bezel": bezel.x - bezel.profileHalf,
      "bezel plinth": bezel.x + bezel.plinthOffset - bezel.plinthR,
      "copper busbar": bus.x - bus.toroidR,
      "ceramic insulator": bus.x - bus.insulatorR
    };
    for (const [name, x] of Object.entries(inner)) expect(x, name).toBeGreaterThan(CORRIDOR_EDGE);
  });

  it("near-layer arch pillars and floating islands stand beyond the rail edge", () => {
    expect(NEAR_DRESSING.arch.r - NEAR_DRESSING.arch.pillarHalf).toBeGreaterThan(CORRIDOR_EDGE);
    // island rim radius tops out at r * 1.04 (ring scale) * 1.13 (jitter + wobble), scenery.ts island().
    expect(NEAR_DRESSING.island.minX - NEAR_DRESSING.island.maxR * 1.04 * 1.13).toBeGreaterThan(CORRIDOR_EDGE);
  });

  it("overhead arches clear the ball at its widest reach", () => {
    const { gate } = CORRIDOR_HARDWARE;
    const gateUnderside =
      gate.yShift + gate.springY + gate.archRise * Math.sqrt(1 - (BALL_REACH / gate.spanR) ** 2) - gate.girderHalf;
    expect(gateUnderside).toBeGreaterThan(BALL_TOP);
    const { arch } = NEAR_DRESSING;
    const archUnderside = arch.yc + Math.sqrt((arch.r - arch.tube) ** 2 - BALL_REACH ** 2) - arch.tube;
    expect(archUnderside).toBeGreaterThan(BALL_TOP);
  });
});

describe("polarity-orbs hazard / pickup visuals match their hitboxes", () => {
  it("sim radii are the rendered mesh radii", () => {
    expect(CONFIG.BALL_RADIUS).toBe(BALL_RADIUS);
    expect(CONFIG.ORB_RADIUS).toBe(ORB_RADIUS);
    expect(CONFIG.GEM_RADIUS).toBe(GEM_RADIUS);
    // Built meshes stay within 10% of the nominal radius (sculpted grooves / facets).
    expect(halfExtentX(heroGyroOrbMesh(BALL_RADIUS)) / BALL_RADIUS).toBeGreaterThan(0.9);
    expect(halfExtentX(heroGyroOrbMesh(BALL_RADIUS)) / BALL_RADIUS).toBeLessThan(1.1);
    expect(halfExtentX(dipoleCollectorOrbMesh(ORB_RADIUS)) / ORB_RADIUS).toBeGreaterThan(0.9);
    expect(halfExtentX(dipoleCollectorOrbMesh(ORB_RADIUS)) / ORB_RADIUS).toBeLessThan(1.1);
    expect(halfExtentX(crownPrismGemMesh(GEM_RADIUS)) / GEM_RADIUS).toBeGreaterThan(0.9);
    expect(halfExtentX(crownPrismGemMesh(GEM_RADIUS)) / GEM_RADIUS).toBeLessThan(1.1);
  });

  const centreRowAt = (sim: PolarityOrbsSim, z: number, laneOffset: number, ballScale: number) => {
    for (const p of sim.powerups) p.active = false;
    const row = sim.rows[0]!;
    // Push every other row far away so only this one can resolve.
    for (const r of sim.rows) if (r !== row) r.z = -200;
    row.z = z;
    row.resolved = false;
    const wrong = (sim.o.polarity === 1 ? -1 : 1) as 1 | -1;
    for (const orb of sim.orbs) {
      if (!orb.active) continue;
      orb.z = orb.row === row.id ? z : -200;
      // Only the centre-lane orb stays, so the lateral reach is measured against one hazard.
      if (orb.row === row.id) {
        orb.polarity = wrong;
        if (orb.x !== 0) orb.active = false;
      }
    }
    sim.o.laneOffset = laneOffset;
    sim.ye = laneOffset;
    sim.o.ballScale = ballScale;
    return row;
  };

  for (const scale of [0.72, 1, CONFIG.SCALE_CAP]) {
    it(`a wrong orb hits exactly when it visually touches the ball (ballScale ${scale})`, () => {
      const reach = contactRadius(scale, ORB_RADIUS);
      expect(reach).toBeCloseTo(BALL_RADIUS * scale + ORB_RADIUS, 9);

      // Just inside the touching distance laterally: the row hits before the orb reaches the ball centre.
      const hit = new PolarityOrbsSim(5);
      hit.advance({ ...IDLE, start: true });
      const row = centreRowAt(hit, -reach - 0.01, reach - 0.02, scale);
      let ticks = 0;
      while (!row.resolved && ticks++ < 30) hit.advance(IDLE);
      expect(hit.o.wrongs).toBe(1);
      expect(hit.o.lives).toBe(CONFIG.MAX_LIVES - 1);

      // Head-on: the hit lands at the front contact, never after the orb has sunk into the ball.
      const head = new PolarityOrbsSim(5);
      head.advance({ ...IDLE, start: true });
      const headRow = centreRowAt(head, -reach - 1, 0, scale);
      while (!headRow.resolved) head.advance(IDLE);
      expect(head.o.wrongs).toBe(1);
      expect(headRow.z).toBeLessThan(-reach + head.o.speed * CONFIG.DT + 1e-9);

      // Just outside the touching distance: the orb slides past without a hit.
      const miss = new PolarityOrbsSim(5);
      miss.advance({ ...IDLE, start: true });
      const missRow = centreRowAt(miss, -reach - 0.01, reach + 0.02, scale);
      ticks = 0;
      while (!missRow.resolved && ticks++ < 30) miss.advance(IDLE);
      expect(miss.o.wrongs).toBe(0);
      expect(miss.o.lives).toBe(CONFIG.MAX_LIVES);
    });
  }

  it("a power-up gem is taken exactly when it visually touches the ball", () => {
    const reach = contactRadius(1, GEM_RADIUS);
    for (const [dx, taken] of [[reach - 0.02, 1], [reach + 0.02, 0]] as const) {
      const sim = new PolarityOrbsSim(9);
      sim.advance({ ...IDLE, start: true });
      for (const r of sim.rows) r.z = -200;
      for (const orb of sim.orbs) orb.z = -200;
      for (const p of sim.powerups) p.active = false;
      const gem = sim.powerups[0]!;
      Object.assign(gem, { active: true, kind: "shield", x: dx, z: -2 });
      sim.o.laneOffset = 0;
      sim.ye = 0;
      for (let i = 0; i < 40; i++) sim.advance(IDLE);
      expect(sim.o.powerupsTaken, `gem at dx=${dx.toFixed(2)}`).toBe(taken);
    }
  });
});

describe("flux-gate arches clear the chase camera", () => {
  it("keeps every girder, rib and keystone above the 5.4 m chase camera across its lateral range", async () => {
    const { CHASE_HEIGHT } = await import("../../../apps/showcase-polarity-orbs/src/presentation");
    const { spanR, springY, archRise, yShift, girderHalf } = CORRIDOR_HARDWARE.gate;
    // Camera x follows half the lane offset (lanes at +-2.3 m, so |x| <= ~1.2 m); allow +-1.6 m and a 0.35 m shake.
    for (let x = -1.6; x <= 1.6; x += 0.2) {
      const a = Math.acos(Math.min(1, Math.abs(x) / spanR));
      const ribUnderside = springY + yShift + Math.sin(a) * (archRise - 0.3) - girderHalf;
      expect(ribUnderside).toBeGreaterThan(CHASE_HEIGHT + 0.35 + 0.5);
    }
    // Keystone: 0.62 m tall box centred on the apex.
    expect(springY + yShift + archRise + 0.04 - 0.31).toBeGreaterThan(CHASE_HEIGHT + 0.85);
  });
});
