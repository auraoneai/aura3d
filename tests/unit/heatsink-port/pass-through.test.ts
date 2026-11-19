/**
 * Pass-through sweep (owner addendum, Nov 2026): every solid-looking piece of decor stays out of the space the craft can
 * fly, and every hazard's visual matches its sim hitbox. Ion Circuit is a port with a recorded reference replay, so the
 * fixes move decor (models.ts, meshes.ts) and never touch the sim.
 *
 * The flyable corridor at station s: craft centres |x| <= hw - halfWidth (the wall clamp in vehicle.ts), outside the
 * split divider (|x| >= dw + halfWidth), body half width halfWidth, body height FLIGHT_BAND above the smooth road.
 */
import { describe, expect, it } from "vitest";
import { ION_IDOL } from "../../../apps/showcase-heatsink-port/src/idol-assets";
import { BEACON, beaconSlots } from "../../../examples/heatsink-port/art/beacons";
import { CFG } from "../../../examples/heatsink-port/config";
import { ARCH_CLEARANCE, FLIGHT_BAND, archSlots, buildArches, buildDividers, buildGantryBanners, buildRails } from "../../../examples/heatsink-port/meshes";
import { DECOR_CLEARANCE, GATE_PYLON_HALF, SCENERY_REACH, gatePylonTransforms, scenerySpots } from "../../../examples/heatsink-port/models";
import { droneEuler } from "../../../examples/heatsink-port/orient";
import { Track, type Frame } from "../../../examples/heatsink-port/track";

const track = new Track();
const V = CFG.vehicle;
const bounds = (a: unknown): readonly number[] => (a as { bounds: readonly number[] }).bounds;

/** smallest (lateral distance - half width) of a world point (x, z) to every road sample: < 0 means it is over a road */
function edgeClearance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < track.n; i++) {
    const dx = x - (track.px[i] as number), dz = z - (track.pz[i] as number);
    const along = dx * (track.tx[i] as number) + dz * (track.tz[i] as number);
    if (Math.abs(along) > track.step) continue;
    const lat = Math.abs(-dx * (track.tz[i] as number) + dz * (track.tx[i] as number));
    best = Math.min(best, lat - (track.hw[i] as number));
  }
  return best;
}

/** the lateral offsets a craft centre can take at s */
function reachable(s: number): number[] {
  const fr = track.frame(s);
  const dw = track.dividerAt(s);
  const out: number[] = [];
  for (let x = -(fr.hw - V.halfWidth); x <= fr.hw - V.halfWidth + 1e-6; x += 0.5) if (!(dw > 0 && Math.abs(x) < dw + V.halfWidth)) out.push(x);
  return out;
}

/** lateral offset and height above `fr.y` of a world vertex, in the frame at s */
const local = (fr: Frame, x: number, y: number, z: number): { lat: number; up: number } => ({ lat: (x - fr.x) * fr.rx + (z - fr.z) * fr.rz, up: y - fr.y });

describe("Ion Circuit pass-through: decor stays out of the flyable corridor", () => {
  it("gate pylons: the whole Idol pylon footprint stands beyond the road edge plus the clearance (was hw + 0.6: 2.9 m over the road)", () => {
    const pylon = bounds(ION_IDOL.ioncGatePylon);
    /* the half extents the placement uses are the GLB's (along = its x, across = its z) */
    expect(GATE_PYLON_HALF.along).toBeCloseTo(pylon[0]! / 2, 1);
    expect(GATE_PYLON_HALF.across).toBeCloseTo(pylon[2]! / 2, 1);
    const transforms = gatePylonTransforms(track, (fr) => droneEuler(fr, 0, 0, 0));
    expect(transforms).toHaveLength(track.checkpoints.length * 2);
    let worst = Infinity;
    transforms.forEach((t, i) => {
      const fr = track.frame(track.checkpoints[i >> 1]!);
      for (let a = -1; a <= 1; a += 0.25) {
        for (let c = -1; c <= 1; c += 0.25) {
          const x = t.position[0] + fr.tx * a * GATE_PYLON_HALF.along + fr.rx * c * GATE_PYLON_HALF.across;
          const z = t.position[2] + fr.tz * a * GATE_PYLON_HALF.along + fr.rz * c * GATE_PYLON_HALF.across;
          worst = Math.min(worst, edgeClearance(x, z));
        }
      }
    });
    expect(worst).toBeGreaterThan(DECOR_CLEARANCE * 0.8);
  });

  it("gate pylons stay grounded: the plinth base is at or under the lowest shoulder point beneath it", () => {
    const transforms = gatePylonTransforms(track, (fr) => droneEuler(fr, 0, 0, 0));
    transforms.forEach((t, i) => {
      const s = track.checkpoints[i >> 1]!;
      const fr = track.frame(s);
      const side = i % 2 === 0 ? -1 : 1;
      const edgeY = fr.y + track.latY(s, side * fr.hw);
      expect(t.position[1]).toBeLessThanOrEqual(edgeY - 0.55 - 0.25 + 1e-6);
      expect(t.position[1]).toBeGreaterThan(edgeY - 4);
    });
  });

  it("canyon scenery (mesas, cryo vents, coolant towers, boost arches): every Idol footprint keeps the clearance from every road", () => {
    const spots = scenerySpots(track);
    let n = 0;
    for (const kind of ["caps", "corals", "ruins", "arches"] as const) {
      for (const spot of spots[kind]) {
        n++;
        let best = Infinity;
        for (let i = 0; i < track.n; i++) {
          const d = Math.hypot(spot.position[0] - (track.px[i] as number), spot.position[2] - (track.pz[i] as number));
          best = Math.min(best, d - (track.hw[i] as number) - SCENERY_REACH[kind] * spot.scale);
        }
        expect(best, `${kind} at ${spot.position.map((v) => v.toFixed(0)).join(",")}`).toBeGreaterThanOrEqual(DECOR_CLEARANCE - 1e-6);
      }
    }
    expect(n).toBeGreaterThan(100);
    /* the reach constants cover the GLBs' plan-view half diagonals' worth of mesh (measured from the vertices, smaller than the boxes' corners) */
    const half = (k: keyof typeof ION_IDOL) => Math.max(bounds(ION_IDOL[k])[0]!, bounds(ION_IDOL[k])[2]!) / 2;
    expect(SCENERY_REACH.caps).toBeGreaterThanOrEqual(half("ioncMesa"));
    expect(SCENERY_REACH.corals).toBeGreaterThanOrEqual(half("ioncCryoVent"));
    expect(SCENERY_REACH.ruins).toBeGreaterThanOrEqual(half("ioncCoolantTower"));
    expect(SCENERY_REACH.arches).toBeGreaterThanOrEqual(half("ioncBoostArch"));
  });

  it("gantry arches: pillars stand outside the road and no reachable flight path meets the crossbeam or the banner", () => {
    const slots = archSlots(track);
    const { body } = buildArches(track);
    const banners = buildGantryBanners(track);
    expect(body.positions.length / 3).toBe(slots.length * 3 * 24);
    expect(banners.positions.length / 3).toBe(slots.length * 4);
    slots.forEach((s, k) => {
      const fr = track.frame(s);
      const box = (b: number) => {
        let latMin = Infinity, latMax = -Infinity, upMin = Infinity, upMax = -Infinity;
        for (let v = 0; v < 24; v++) {
          const o = ((k * 3 + b) * 24 + v) * 3;
          const p = local(fr, body.positions[o]!, body.positions[o + 1]!, body.positions[o + 2]!);
          latMin = Math.min(latMin, p.lat); latMax = Math.max(latMax, p.lat); upMin = Math.min(upMin, p.up); upMax = Math.max(upMax, p.up);
        }
        return { latMin, latMax, upMin, upMax };
      };
      /* pillars: inner face beyond the road edge */
      for (const b of [0, 1]) {
        const p = box(b);
        expect(Math.min(Math.abs(p.latMin), Math.abs(p.latMax))).toBeGreaterThan(fr.hw + 0.5);
      }
      /* the beam and the banner never cross the craft's body at any reachable lateral offset */
      const beam = box(2);
      expect(beam.upMin).toBeCloseTo(ARCH_CLEARANCE.beamBottom, 3);
      let bLo = Infinity, bHi = -Infinity, bLat = 0;
      for (let v = 0; v < 4; v++) {
        const o = (k * 4 + v) * 3;
        const p = local(fr, banners.positions[o]!, banners.positions[o + 1]!, banners.positions[o + 2]!);
        bLo = Math.min(bLo, p.up); bHi = Math.max(bHi, p.up); bLat = Math.max(bLat, Math.abs(p.lat));
      }
      for (const x of reachable(s)) {
        const g = track.smoothGroundY(s, x) - fr.y;
        const lo = g + FLIGHT_BAND.low, hi = g + FLIGHT_BAND.high;
        expect(hi > beam.upMin && lo < beam.upMax, `beam at s=${s}, x=${x}`).toBe(false);
        if (Math.abs(x) - V.halfWidth < bLat) expect(hi > bLo && lo < bHi, `banner at s=${s}, x=${x}`).toBe(false);
      }
    });
  });

  it("the two split-ramp arch stations that put the beam or banner in the raised lane's flight path are skipped", () => {
    const all: number[] = [];
    for (let s = 120; s < track.length - 60; s += 240) all.push(s);
    expect(all.filter((s) => !archSlots(track).includes(s))).toEqual([6600, 7080]);
  });

  it("lane beacons on the road edge stay under the craft's belly (it hovers over them)", () => {
    expect(beaconSlots(track).length).toBeGreaterThan(0);
    expect(BEACON.height).toBeLessThan(FLIGHT_BAND.low - 1);
  });

  it("the flight band matches real races: the hover gap stays inside it at 40 to 115 m/s", async () => {
    const { Race, FRAME } = await import("../../../examples/heatsink-port/race");
    const { createBot } = await import("../../../examples/heatsink-port/bot");
    for (const speed of [40, 115]) {
      const race = new Race(track);
      const bot = createBot({ speed });
      for (let i = 0; i < 60 * 120 && !race.resultsOpen; i++) {
        race.frame(FRAME, bot(race));
        const p = race.player;
        if (race.state !== "race" || p.crashed) continue;
        const gap = p.yW - track.smoothGroundY(p.s, p.x);
        /* the hull spans -0.11 .. +0.97 m about yW */
        expect(gap - 0.2).toBeGreaterThan(FLIGHT_BAND.low);
        expect(gap + 1.0).toBeLessThan(FLIGHT_BAND.high);
      }
    }
  }, 60_000);
});

describe("Ion Circuit pass-through: hazard visuals match their sim hitboxes", () => {
  it("walls: the rails' inner face sits within 0.5 m outside the wall clamp (hull edge at hw)", () => {
    const { rails, posts } = buildRails(track, 25);
    const rows = Math.ceil(track.length / 25);
    const ds = track.length / rows;
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i <= rows; i++) {
        const fr = track.frame(i * ds);
        let inner = Infinity;
        for (let v = 0; v < 4; v++) {
          const o = ((side * (rows + 1) + i) * 4 + v) * 3;
          inner = Math.min(inner, Math.abs(local(fr, rails.positions[o]!, rails.positions[o + 1]!, rails.positions[o + 2]!).lat));
        }
        expect(inner - fr.hw).toBeGreaterThanOrEqual(0);
        expect(inner - fr.hw).toBeLessThan(0.5);
      }
    }
    expect(posts.positions.length).toBeGreaterThan(0);
  });

  it("split dividers: the wall faces stand exactly where the divider clamp stops the hull", () => {
    const m = buildDividers(track, 3, 3);
    const rows = Math.ceil(track.length / 3);
    const ds = track.length / rows;
    let q = 0;
    let checked = 0;
    for (let i = 0; i < rows; i++) {
      const s0 = i * ds;
      if (track.dividerAt(s0) <= 0 || track.dividerAt((i + 1) * ds) <= 0) continue;
      const fr = track.frame(s0);
      const o = q * 12 * 3; /* 3 quads (12 vertices) per row; the first vertex is the -d0 face at s0 */
      const p = local(fr, m.positions[o]!, m.positions[o + 1]!, m.positions[o + 2]!);
      /* vehicle.ts: the centre clamps at dw + halfWidth, so the hull's edge stops at dw */
      expect(Math.abs(Math.abs(p.lat) - track.dividerAt(s0))).toBeLessThan(0.05);
      q++;
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("barrels: the drum plus the hull meets the sim's plan-view trigger box within 0.5 m (race.ts: |ds| < 3.2, |dx| < 3)", () => {
    const drum = bounds(ION_IDOL.ioncBarrel);
    const hull = bounds(ION_IDOL.ioncDrone);
    const touchAcross = drum[0]! / 2 + hull[0]! / 2;
    const touchAlong = drum[2]! / 2 + hull[2]! / 2;
    expect(Math.abs(touchAcross - 3)).toBeLessThan(0.5);
    expect(Math.abs(touchAlong - 3.2)).toBeLessThan(0.5);
  });
});
