import { describe, expect, it } from "vitest";
import { parkPracticals } from "../../../apps/showcase-aura-diamond-3d/art/look";
import { fieldInstanceTransforms, FIELDER_SPOTS, floodTowerBases, outfieldWallTransforms } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import {
  BALL_FLOOR_Y,
  COACH_SPOTS,
  DUGOUT_HALF,
  DUGOUT_SPOTS,
  FIELDER_FENCE_MARGIN,
  FOUL_DEG,
  FOUL_POLE_H,
  MOUND_TOP,
  MOUND_Z,
  PARKS,
  PARK_ORDER,
  PLAYER_MIN_SEP,
  POLE_HIT_R,
  SIM_STEP,
  ballFloorY,
  clampInsideFence,
  fenceRadius,
  foulPolePositions,
  inDugoutFootprint,
  lerp,
  makeRng,
  polarOf,
  predictLanding,
  separateBodies,
  stepFlight,
  type FlightState,
  type ParkSpec,
  type SepBody,
  type Vec3
} from "../../../apps/showcase-aura-diamond-3d/src/rules";

const CONTACT: Vec3 = [0, 1, 0.3];
const EPS = 1e-6;

const launch = (ev: number, laDeg: number, sprayDeg: number): Vec3 => {
  const la = (laDeg * Math.PI) / 180;
  const sp = (sprayDeg * Math.PI) / 180;
  return [ev * Math.cos(la) * Math.sin(sp), ev * Math.sin(la), -ev * Math.cos(la) * Math.cos(sp)];
};

/** Fair, playable ground: inside the foul lines and inside the wall. */
const inFairPlay = (park: ParkSpec, x: number, z: number): boolean => {
  const { theta, r } = polarOf(x, z);
  return Math.abs(theta) <= FOUL_DEG && r <= fenceRadius(park, theta);
};

const expectChaseSpotLegal = (park: ParkSpec, x: number, z: number, what: string): void => {
  const { theta, r } = polarOf(x, z);
  expect(Math.abs(theta), `${park.id} ${what}: θ=${theta.toFixed(2)}`).toBeLessThanOrEqual(FOUL_DEG + EPS);
  expect(r, `${park.id} ${what}: r=${r.toFixed(2)}`).toBeLessThanOrEqual(fenceRadius(park, theta) - FIELDER_FENCE_MARGIN + EPS);
  expect(inDugoutFootprint(x, z, PLAYER_MIN_SEP / 2), `${park.id} ${what}: in a dugout`).toBe(false);
  for (const [cx, cz] of Object.values(COACH_SPOTS)) {
    expect(Math.hypot(x - cx, z - cz), `${park.id} ${what}: on a coach`).toBeGreaterThanOrEqual(PLAYER_MIN_SEP);
  }
};

describe("fielders never run through the wall, into foul ground, the dugouts or the coaches (a)", () => {
  it("the dugout footprint constants are the drawn dugouts", () => {
    const d = fieldInstanceTransforms(PARKS.sandlot).dugouts;
    expect(d.map((t) => [t.position[0], t.position[2]])).toEqual(DUGOUT_SPOTS.map(([x, z]) => [x, z]));
  });

  for (const id of PARK_ORDER) {
    it(`${id}: every chase target and every frame of the chase stays legal for a sweep of hits incl. home runs and fouls`, () => {
      const park = PARKS[id];
      let homers = 0;
      let fouls = 0;
      let walls = 0;
      for (let spray = -70; spray <= 70; spray += 2.5) {
        for (const la of [4, 14, 24, 32, 42, 55]) {
          for (const ev of [22, 34, 46, 58]) {
            const pr = predictLanding(CONTACT, launch(ev, la, spray), park);
            if (pr.hrCrossed) homers++;
            if (Math.abs(pr.landTheta) > FOUL_DEG) fouls++;
            if (pr.wallHit) walls++;
            const [tx, tz] = clampInsideFence(park, pr.landPos[0], pr.landPos[2]);
            expectChaseSpotLegal(park, tx, tz, `target spray=${spray} la=${la} ev=${ev}`);
            // The live chase lerps from the fielder's spot toward the landing and clamps every frame.
            for (const fid of ["f-1b", "f-3b", "f-cf", "f-lf", "f-rf"]) {
              const s = FIELDER_SPOTS[fid]!;
              for (const u of [0.25, 0.5, 0.78, 1]) {
                const [x, z] = clampInsideFence(park, lerp(s[0], pr.landPos[0], u), lerp(s[2], pr.landPos[2], u));
                expectChaseSpotLegal(park, x, z, `${fid} u=${u} spray=${spray}`);
              }
            }
          }
        }
      }
      // The sweep really covers the cases that used to pass through solids.
      expect(homers).toBeGreaterThan(10);
      expect(fouls).toBeGreaterThan(50);
      expect(walls).toBeGreaterThan(0);
    }, 60_000);
  }

  it("centre field chasing a home run stops on the warning track, not at r≈105 past the wall", () => {
    const park = PARKS.ivy;
    const [x, z] = clampInsideFence(park, 0, -105);
    expect(x).toBeCloseTo(0, 6);
    expect(-z).toBeCloseTo(park.fenceCenter - FIELDER_FENCE_MARGIN, 6);
  });

  it("a foul down the right-field line pulls first base to the foul line, not into the dugout or onto the coach", () => {
    const park = PARKS.sandlot;
    for (const [lx, lz] of [[28, -6], [21.5, -14.8], [30, 2], [24, -10]] as const) {
      const [x, z] = clampInsideFence(park, lx, lz);
      expect(Math.abs(polarOf(x, z).theta)).toBeCloseTo(FOUL_DEG, 6);
      expectChaseSpotLegal(park, x, z, `foul (${lx}, ${lz})`);
    }
  });

  it("points already legal are returned unchanged", () => {
    const park = PARKS.canyon;
    for (const [x, z] of [[0, -40], [10, -30], [-20, -60], [14.2, -14.2]] as const) {
      const [cx, cz] = clampInsideFence(park, x, z);
      expect(cx).toBeCloseTo(x, 9);
      expect(cz).toBeCloseTo(z, 9);
    }
  });
});

describe("the wall's collider spans exactly the drawn wall (b)", () => {
  /** Polar angle of both ends of every drawn wall segment (unit box along local X, scaled to the chord). */
  const drawnExtent = (park: ParkSpec): [number, number] => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of outfieldWallTransforms(park).wall) {
      const a = t.rotation[1];
      const hx = (Math.cos(a) * t.scale[0]) / 2;
      const hz = (-Math.sin(a) * t.scale[0]) / 2;
      for (const s of [-1, 1]) {
        const th = polarOf(t.position[0] + s * hx, t.position[2] + s * hz).theta;
        lo = Math.min(lo, th);
        hi = Math.max(hi, th);
      }
    }
    return [lo, hi];
  };

  /** A ball rolling out at knee height at field angle θ, poles ignored: does it rebound off the wall? */
  const wallStops = (park: ParkSpec, thetaDeg: number): boolean => {
    const rad = (thetaDeg * Math.PI) / 180;
    const dir: [number, number] = [Math.sin(rad), -Math.cos(rad)];
    const r0 = fenceRadius(park, thetaDeg) - 0.3;
    const s: FlightState = { pos: [dir[0] * r0, 0.6, dir[1] * r0], vel: [dir[0] * 20, 0, dir[1] * 20], crossedFence: false, hrCrossed: false, wallHit: false, poleHit: true };
    for (let i = 0; i < 12; i++) stepFlight(s, park, SIM_STEP);
    return s.wallHit;
  };

  for (const id of PARK_ORDER) {
    it(`${id}: the angle where the wall stops a low ball matches the drawn wall's ends`, () => {
      const park = PARKS[id];
      const [lo, hi] = drawnExtent(park);
      // The wall is drawn pole to pole (the segment overlap adds a hair past the line).
      expect(hi).toBeGreaterThanOrEqual(FOUL_DEG);
      expect(hi).toBeLessThan(FOUL_DEG + 0.3);
      expect(lo).toBeLessThanOrEqual(-FOUL_DEG);
      expect(lo).toBeGreaterThan(-FOUL_DEG - 0.3);
      // Bisect the collider's edge on each side.
      for (const side of [-1, 1]) {
        let inside = 40;
        let outside = 60;
        expect(wallStops(park, side * inside)).toBe(true);
        expect(wallStops(park, side * outside)).toBe(false);
        for (let k = 0; k < 30; k++) {
          const mid = (inside + outside) / 2;
          if (wallStops(park, side * mid)) inside = mid;
          else outside = mid;
        }
        const drawnEdge = side > 0 ? hi : -lo;
        expect(Math.abs(inside - drawnEdge), `${id} side ${side}: collider ${inside.toFixed(3)}° vs drawn ${drawnEdge.toFixed(3)}°`).toBeLessThan(0.3);
        // No invisible wall past the drawn end (the old collider reached FOUL_DEG + 4).
        expect(wallStops(park, side * (FOUL_DEG + 2))).toBe(false);
      }
    });
  }
});

describe("foul poles are solid (c)", () => {
  /** A ball flying straight at a pole at height y, from 6 m short of it. */
  const atPole = (park: ParkSpec, side: 0 | 1, y: number, lateral = 0): FlightState => {
    const [px, pz] = foulPolePositions(park)[side]!;
    const r = Math.hypot(px, pz);
    const dir: [number, number] = [px / r, pz / r];
    const perp: [number, number] = [-dir[1], dir[0]];
    return {
      pos: [px - dir[0] * 6 + perp[0] * lateral, y, pz - dir[1] * 6 + perp[1] * lateral],
      vel: [dir[0] * 35, 0, dir[1] * 35],
      crossedFence: false,
      hrCrossed: false,
      wallHit: false
    };
  };

  const minPoleGap = (park: ParkSpec, s: FlightState, steps: number): number => {
    let gap = Infinity;
    for (let i = 0; i < steps; i++) {
      stepFlight(s, park, SIM_STEP);
      if (s.pos[1] < FOUL_POLE_H) {
        for (const [px, pz] of foulPolePositions(park)) gap = Math.min(gap, Math.hypot(s.pos[0] - px, s.pos[2] - pz));
      }
    }
    return gap;
  };

  it("the collision poles stand where the scene draws them", () => {
    for (const id of PARK_ORDER) {
      const drawn = fieldInstanceTransforms(PARKS[id]).poles.map((t) => [t.position[0], t.position[2]]);
      const coll = foulPolePositions(PARKS[id]);
      drawn.forEach(([x, z], i) => {
        expect(coll[i]![0]).toBeCloseTo(x!, 9);
        expect(coll[i]![1]).toBeCloseTo(z!, 9);
      });
    }
  });

  for (const id of PARK_ORDER) {
    it(`${id}: a ball hitting a pole above the wall rebounds off it, a fair home run`, () => {
      const park = PARKS[id];
      for (const side of [0, 1] as const) {
        for (const lateral of [0, 0.15, -0.2]) {
          const s = atPole(park, side, park.wallH + 3, lateral);
          const gap = minPoleGap(park, s, 90);
          expect(s.poleHit).toBe(true);
          expect(s.hrCrossed).toBe(true);
          expect(s.wallHit).toBe(false);
          // It never gets inside the pole, and it comes back toward the field.
          expect(gap).toBeGreaterThanOrEqual(POLE_HIT_R - 1e-6);
          const [px, pz] = foulPolePositions(park)[side]!;
          expect(s.vel[0] * px + s.vel[2] * pz).toBeLessThan(0);
        }
      }
    });
  }

  it("below the wall top the pole still stops the ball (an in-play rebound); above the pole top the ball sails past", () => {
    const park = PARKS.sandlot;
    const low = atPole(park, 1, 0.6);
    expect(minPoleGap(park, low, 60)).toBeGreaterThanOrEqual(POLE_HIT_R - 1e-6);
    expect(low.crossedFence).toBe(true);
    expect(low.wallHit).toBe(true);
    expect(low.hrCrossed).toBe(false);
    const high = atPole(park, 1, FOUL_POLE_H + 2);
    for (let i = 0; i < 60; i++) stepFlight(high, park, SIM_STEP);
    expect(high.poleHit).not.toBe(true);
  });

  it("a batted ball down the line can hit the pole, and the prediction and the live flight agree", () => {
    const park = PARKS.sandlot;
    let found: Vec3 | null = null;
    for (let la = 18; la <= 40 && !found; la += 0.5) {
      for (let ev = 30; ev <= 60 && !found; ev += 0.5) {
        const v = launch(ev, la, FOUL_DEG);
        const p = predictLanding(CONTACT, v, park);
        if (p.poleHit && p.hrCrossed) found = v;
      }
    }
    expect(found).not.toBeNull();
    const pr = predictLanding(CONTACT, found!, park);
    expect(pr.hrCrossed).toBe(true);
    const live: FlightState = { pos: [...CONTACT], vel: [...found!], crossedFence: false, hrCrossed: false, wallHit: false };
    for (let t = 0; t < pr.hangT - SIM_STEP / 2; t += SIM_STEP) stepFlight(live, park, SIM_STEP);
    expect(live.poleHit).toBe(true);
    expect(Math.hypot(live.pos[0] - pr.landPos[0], live.pos[2] - pr.landPos[2])).toBeLessThan(0.5);
  });
});

describe("players never overlap (d)", () => {
  const minPair = (bodies: readonly SepBody[]): number => {
    let m = Infinity;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) m = Math.min(m, Math.hypot(bodies[i]!.x - bodies[j]!.x, bodies[i]!.z - bodies[j]!.z));
    return m;
  };

  it("random pile-ups end with every pair at least the minimum apart; fixed bodies never move; the result is deterministic", () => {
    const rng = makeRng(0xd1a);
    for (let trial = 0; trial < 300; trial++) {
      const cx = (rng() - 0.5) * 60;
      const cz = -10 - rng() * 60;
      // Two fixed bodies (a runner and the pitcher, say) at least a player's width apart (as on the field: a gap narrower
      // than 2 x PLAYER_MIN_SEP between two immovable bodies cannot hold a fielder), and up to seven fielders piled on them.
      const fixed: SepBody[] = [
        { x: cx, z: cz, rank: Infinity },
        { x: cx + 2 * PLAYER_MIN_SEP + 0.1 + rng() * 2, z: cz + (rng() - 0.5) * 2, rank: Infinity }
      ];
      const n = 2 + Math.floor(rng() * 6);
      const movers: SepBody[] = Array.from({ length: n }, (_, i) => ({ x: cx + (rng() - 0.5) * 1.6, z: cz + (rng() - 0.5) * 1.6, rank: i === 0 ? 2 : 1 }));
      if (trial % 7 === 0) movers[0] = { x: cx, z: cz, rank: 2 }; // exactly on top of the runner
      const a = [...movers.map((b) => ({ ...b })), ...fixed.map((b) => ({ ...b }))];
      const b = a.map((x) => ({ ...x }));
      separateBodies(a, PLAYER_MIN_SEP);
      separateBodies(b, PLAYER_MIN_SEP);
      expect(minPair(a), `trial ${trial}`).toBeGreaterThanOrEqual(PLAYER_MIN_SEP - 1e-6);
      expect(a).toEqual(b);
      a.slice(n).forEach((f, i) => {
        expect(f.x).toBe(fixed[i]!.x);
        expect(f.z).toBe(fixed[i]!.z);
      });
    }
  });

  it("a fielder on a runner yields to the runner; equal fielders split the overlap", () => {
    const bodies: SepBody[] = [
      { x: 12.73, z: -12.73, rank: 1 },
      { x: 12.73, z: -12.73, rank: Infinity }
    ];
    separateBodies(bodies, PLAYER_MIN_SEP);
    expect(bodies[1]).toEqual({ x: 12.73, z: -12.73, rank: Infinity });
    expect(Math.hypot(bodies[0]!.x - 12.73, bodies[0]!.z + 12.73)).toBeGreaterThanOrEqual(PLAYER_MIN_SEP - 1e-6);
    const pair: SepBody[] = [
      { x: 0, z: -40, rank: 1 },
      { x: 0.3, z: -40, rank: 1 }
    ];
    separateBodies(pair, PLAYER_MIN_SEP);
    expect(pair[0]!.x + pair[1]!.x).toBeCloseTo(0.3, 9);
    expect(pair[1]!.x - pair[0]!.x).toBeGreaterThanOrEqual(PLAYER_MIN_SEP - 1e-6);
  });

  it("with the fence constraint, two fielders converging at the wall end apart and inside the fence", () => {
    const park = PARKS.sandlot;
    const r = fenceRadius(park, 0) - FIELDER_FENCE_MARGIN;
    const bodies: SepBody[] = [
      { x: 0, z: -r, rank: 2 },
      { x: 0.2, z: -r + 0.1, rank: 1 },
      { x: -0.3, z: -r + 0.2, rank: 1 }
    ];
    separateBodies(bodies, PLAYER_MIN_SEP, (_i, x, z) => clampInsideFence(park, x, z));
    expect(minPair(bodies)).toBeGreaterThanOrEqual(PLAYER_MIN_SEP - 1e-6);
    for (const b of bodies) expect(polarOf(b.x, b.z).r).toBeLessThanOrEqual(fenceRadius(park, polarOf(b.x, b.z).theta) - FIELDER_FENCE_MARGIN + EPS);
  });
});

describe("set pieces next to the field stay out of fair territory (e)", () => {
  /** Ground samples of a footprint: its outline and interior. */
  const rectSamples = (cx: number, cz: number, hx: number, hz: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) out.push([cx - hx + (2 * hx * i) / 10, cz - hz + (2 * hz * j) / 10]);
    return out;
  };
  const discSamples = (cx: number, cz: number, r: number): [number, number][] => {
    const out: [number, number][] = [[cx, cz]];
    for (let k = 0; k < 32; k++) out.push([cx + Math.cos((k / 32) * Math.PI * 2) * r, cz + Math.sin((k / 32) * Math.PI * 2) * r]);
    return out;
  };
  const TOWER_FOOT = 1.4; // flood tower plinth (1.9 m square) half-diagonal
  const COACH_FOOT = PLAYER_MIN_SEP / 2;

  for (const id of PARK_ORDER) {
    it(`${id}: dugouts, coaches and light towers do not intersect fair, playable ground`, () => {
      const park = PARKS[id];
      const pieces: { what: string; samples: [number, number][] }[] = [
        ...DUGOUT_SPOTS.map(([x, z], i) => ({ what: `dugout ${i}`, samples: rectSamples(x, z, DUGOUT_HALF[0], DUGOUT_HALF[1]) })),
        ...Object.entries(COACH_SPOTS).map(([name, [x, z]]) => ({ what: name, samples: discSamples(x, z, COACH_FOOT) })),
        ...(park.flood ? floodTowerBases(park).map(([x, z], i) => ({ what: `flood tower ${i}`, samples: discSamples(x, z, TOWER_FOOT) })) : []),
        ...parkPracticals(park, "high")
          .filter((p) => p.base)
          .map((p) => ({ what: p.name, samples: discSamples(p.base![0], p.base![1], TOWER_FOOT) }))
      ];
      for (const piece of pieces) {
        for (const [x, z] of piece.samples) {
          expect(inFairPlay(park, x, z), `${id} ${piece.what} at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
        }
      }
    });
  }
});

describe("a ball landing on the mound stops on its surface (5)", () => {
  it("the floor follows the mound and is flat elsewhere", () => {
    expect(ballFloorY(0, MOUND_Z)).toBeCloseTo(BALL_FLOOR_Y + MOUND_TOP + 0.004, 9);
    expect(ballFloorY(0, -40)).toBe(BALL_FLOOR_Y);
    expect(ballFloorY(3, MOUND_Z)).toBe(BALL_FLOOR_Y);
  });

  it("a soft liner back at the pitcher lands on top of the mound, not inside it", () => {
    const park = PARKS.sandlot;
    let hit: ReturnType<typeof predictLanding> | null = null;
    for (let la = -2; la <= 20 && !hit; la += 0.25) {
      for (let ev = 8; ev <= 30 && !hit; ev += 0.25) {
        const pr = predictLanding(CONTACT, launch(ev, la, 0), park);
        if (Math.hypot(pr.landPos[0], pr.landPos[2] - MOUND_Z) < 0.6) hit = pr;
      }
    }
    expect(hit).not.toBeNull();
    expect(hit!.landPos[1]).toBeGreaterThan(BALL_FLOOR_Y + MOUND_TOP * 0.9);
  });
});
