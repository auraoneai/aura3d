import { describe, expect, it } from "vitest";
import {
  BAR_SIZE, BLOCK_SIZE, GAP_SIZE, LANE_WIDTH, ROAD_WIDTH, WALL_SIZE,
  gapChasmQuadMesh, monolithWallGlowParts, monolithWallMesh, monolithWallTrussMesh, plasmaCrossbarParts,
  speakerBlockGlowParts, speakerBlockHardwareMesh, speakerBlockMesh, stanchionPostsMesh
} from "../../../apps/showcase-beat-hopper/src/meshes";
import { ALL_LANES, BeatHopperSim, CONFIG, IDLE, laneAt, laneX, type ObstacleType } from "../../../apps/showcase-beat-hopper/src/sim";
import { DUCK_PITCH, IDOL_BOT_HEIGHT, IDOL_DUCK_SY, botPoseScale, buildWorld } from "../../../apps/showcase-beat-hopper/src/world";

/**
 * "The guy runs right through a pole": every solid thing the hopper can reach must either sit outside its corridor
 * (decor) or be a hazard whose drawn mesh matches the sim's hitbox (lane mask in x, clearance heights in y).
 * Bounds are read from the built scene (`scene.toJSON()`: baked custom geometry, instance transforms, asset bounds)
 * and from the same mesh builders / CONFIG the world and sim use.
 */

type V3 = [number, number, number];
type Box = { min: V3; max: V3 };
type N = {
  name?: string; kind?: string; position?: number[]; rotation?: number[]; scale?: number | number[];
  children?: N[]; instances?: { position?: number[]; rotation?: number[]; scale?: number | number[] }[];
  geometry?: { positions?: Record<string, number> | ArrayLike<number>; indices?: Record<string, number> | ArrayLike<number> };
  asset?: { bounds?: readonly number[] };
};

const arr = (a: ArrayLike<number> | Record<string, number>): ArrayLike<number> =>
  Array.isArray(a) || ArrayBuffer.isView(a) ? (a as ArrayLike<number>) : Object.values(a as Record<string, number>);
const meshBox = (positions: ArrayLike<number> | Record<string, number>): Box => {
  const p = arr(positions);
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k]!, p[i + k]!);
    max[k] = Math.max(max[k]!, p[i + k]!);
  }
  return { min, max };
};
const union = (boxes: Box[]): Box => meshBox(boxes.flatMap((b) => [...b.min, ...b.max]));

/** Affine transform as [m00..m22, tx, ty, tz] (column vectors); Euler XYZ like the engine's authoring order. */
type M = { r: number[][]; t: V3 };
const IDENT: M = { r: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
function local(pos?: number[], rot?: number[], scale?: number | number[]): M {
  const [rx, ry, rz] = [rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0];
  const s = typeof scale === "number" ? [scale, scale, scale] : [scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1];
  const X = [[1, 0, 0], [0, Math.cos(rx), -Math.sin(rx)], [0, Math.sin(rx), Math.cos(rx)]];
  const Y = [[Math.cos(ry), 0, Math.sin(ry)], [0, 1, 0], [-Math.sin(ry), 0, Math.cos(ry)]];
  const Z = [[Math.cos(rz), -Math.sin(rz), 0], [Math.sin(rz), Math.cos(rz), 0], [0, 0, 1]];
  const mul = (a: number[][], b: number[][]) => a.map((row) => [0, 1, 2].map((c) => row[0]! * b[0]![c]! + row[1]! * b[1]![c]! + row[2]! * b[2]![c]!));
  const R = mul(mul(X, Y), Z).map((row) => row.map((v, c) => v * s[c]!));
  return { r: R, t: [pos?.[0] ?? 0, pos?.[1] ?? 0, pos?.[2] ?? 0] };
}
const compose = (a: M, b: M): M => ({
  r: a.r.map((row) => [0, 1, 2].map((c) => row[0]! * b.r[0]![c]! + row[1]! * b.r[1]![c]! + row[2]! * b.r[2]![c]!)),
  t: [0, 1, 2].map((i) => a.r[i]![0]! * b.t[0] + a.r[i]![1]! * b.t[1] + a.r[i]![2]! * b.t[2] + a.t[i]!) as V3
});
const apply = (m: M, b: Box): Box => {
  const pts: number[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
    for (let i = 0; i < 3; i++) pts.push(m.r[i]![0]! * x + m.r[i]![1]! * y + m.r[i]![2]! * z + m.t[i]!);
  }
  return meshBox(pts);
};

/**
 * World AABBs of every drawn piece under `n`: per triangle for custom geometry (stage batches merge many props on both
 * sides of the track into one mesh), per instance for instanced geometry and GLB models (asset bounds).
 */
function boxesOf(n: N, parent: M = IDENT, out: { name: string; box: Box }[] = []): { name: string; box: Box }[] {
  const m = compose(parent, local(n.position, n.rotation, n.scale));
  const frames = n.instances?.length ? n.instances.map((t) => compose(m, local(t.position, t.rotation, t.scale))) : [m];
  const name = n.name ?? "?";
  if (n.geometry?.positions) {
    const p = arr(n.geometry.positions), idx = n.geometry.indices ? arr(n.geometry.indices) : null;
    for (const f of frames) {
      const [r0, r1, r2] = f.r as [number[], number[], number[]];
      const w = new Float64Array(p.length);
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
        w[i] = r0[0]! * x + r0[1]! * y + r0[2]! * z + f.t[0];
        w[i + 1] = r1[0]! * x + r1[1]! * y + r1[2]! * z + f.t[1];
        w[i + 2] = r2[0]! * x + r2[1]! * y + r2[2]! * z + f.t[2];
      }
      if (!idx) { out.push({ name, box: meshBox(w) }); continue; }
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i]! * 3, b = idx[i + 1]! * 3, c = idx[i + 2]! * 3;
        const min: V3 = [0, 0, 0], max: V3 = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(w[a + k]!, w[b + k]!, w[c + k]!);
          max[k] = Math.max(w[a + k]!, w[b + k]!, w[c + k]!);
        }
        out.push({ name, box: { min, max } });
      }
    }
  } else if (n.asset?.bounds) {
    const [bw, bh, bd] = n.asset.bounds as number[];
    // `aura3d assets normalize`: centred in X/Z, grounded at y = 0.
    const shape: Box = { min: [-bw! / 2, 0, -bd! / 2], max: [bw! / 2, bh!, bd! / 2] };
    for (const f of frames) out.push({ name, box: apply(f, shape) });
  }
  for (const c of n.children ?? []) boxesOf(c, m, out);
  return out;
}

/**
 * The hopper's corridor: every lane it can stand, hop, big-jump or duck in, across the whole road deck (|x| up to the
 * deck edge, which already covers the outer lanes' edge plus the bot's half-width), from the deck top to the top of a
 * Big Jump. Scrolling decor passes every z, so the corridor is unbounded in z.
 */
const CORRIDOR = { halfX: ROAD_WIDTH / 2, minY: 0, maxY: CONFIG.BIG_JUMP_HEIGHT + IDOL_BOT_HEIGHT * 1.18 };

/** Top-level scene nodes that are the track itself, the hero, the hazards, or non-solid light / particle volumes. */
const NOT_DECOR = new Set([
  "stage-environment", "moon-key", "stage-gold-kicker", "stage-cyan-rim", "sky", "stage-floor", "stage-ridges",
  "girder", "underglow", "deck", "rails", "beat-pad-glass", "beat-pad-lacquer", "stripes", "lane-dashes",
  "player", "bot-skate-l", "bot-skate-r", "bot-wheels-l", "bot-wheels-r", "bot-boost-flare", "player-shadow",
  "blocks", "block-chrome", "block-glow", "bar-posts", "bars", "gaps", "walls", "wall-truss", "wall-glow",
  "orbs", "orb-glow", "rings", "vfx-ripples", "vfx-sparks", "particles", "stage-fog", "ao", "ssr", "grade", "vignette",
  "grp-motes", "grp-beams-l", "grp-beams-r"
]);
/** Light-only children inside decor groups (additive glow cones / neon tubes, not solid). */
const NON_SOLID = new Set(["stage-arch-glow"]);

const sceneNodes = (): N[] => buildWorld({ sim: new BeatHopperSim(7), aspect: 16 / 9 }).scene.toJSON().nodes as unknown as N[];

const intersectsCorridor = (b: Box): boolean =>
  b.min[0] < CORRIDOR.halfX && b.max[0] > -CORRIDOR.halfX && b.min[1] < CORRIDOR.maxY && b.max[1] > CORRIDOR.minY;

describe("beat-hopper: nothing solid is passed through", () => {
  it("no decor footprint intersects the hopper's corridor (dressing, palms, arches, pylons, EQ banks, judgement gate)", () => {
    const nodes = sceneNodes();
    const decor = nodes.filter((n) => n.kind !== "effect" && n.kind !== "light" && !NOT_DECOR.has(n.name ?? ""));
    // Every decor group the world builds is checked (a new prop has to land in one of these lists to pass).
    expect(decor.map((n) => n.name).sort()).toEqual([
      "beat-threshold-gate", "grp-arches", "grp-city", "grp-dress-decks", "grp-dress-stacks", "grp-eq", "grp-isles",
      "grp-palms", "grp-pylons", "stage-far-city"
    ]);
    const hits: string[] = [];
    let checked = 0;
    for (const n of decor) {
      const strip = (x: N): N => ({ ...x, children: x.children?.filter((c) => !NON_SOLID.has(c.name ?? "")).map(strip) });
      for (const { name, box } of boxesOf(strip(n))) {
        checked++;
        if (intersectsCorridor(box) && hits.length < 20) hits.push(`${n.name}/${name} x[${box.min[0].toFixed(2)}, ${box.max[0].toFixed(2)}] y[${box.min[1].toFixed(2)}, ${box.max[1].toFixed(2)}]`);
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(hits).toEqual([]);
  }, 60_000);

  it("the beat-pumping dressing groups only ever move away from the corridor", () => {
    // bindDressing scales grp-dress-stacks by >= 1 about x = 0 (pushes towers outward, keeps feet on the floor) and
    // bobs grp-dress-decks up by <= 0.14 m: re-check the deck consoles at the top of the bob.
    const decks = sceneNodes().find((n) => n.name === "grp-dress-decks")!;
    const lifted = { ...decks, position: [0, (decks.position?.[1] ?? 0) + 0.14, 0] };
    for (const { box } of boxesOf(lifted)) expect(intersectsCorridor(box)).toBe(false);
  });

  const visual: Record<ObstacleType, Box> = {
    block: union([speakerBlockMesh(), speakerBlockHardwareMesh(), speakerBlockGlowParts().mesh].map((m) => meshBox(m.positions))),
    bar: union([stanchionPostsMesh(), plasmaCrossbarParts().mesh].map((m) => meshBox(m.positions))),
    wall: union([monolithWallMesh(), monolithWallTrussMesh(), monolithWallGlowParts().mesh].map((m) => meshBox(m.positions))),
    gap: meshBox(gapChasmQuadMesh().positions)
  };

  it("every hazard's drawn width matches its lane hitbox (one piece per blocked lane, centred on laneX)", () => {
    const half = CONFIG.LANE_WIDTH / 2;
    expect(LANE_WIDTH).toBe(CONFIG.LANE_WIDTH);
    for (const type of ["block", "bar", "wall", "gap"] as const) {
      const b = visual[type];
      expect(Math.abs(b.min[0] + b.max[0]), `${type} centred`).toBeLessThan(0.02);
      // Never spills into a neighbouring lane (the sim judges by the nearest lane centre: |x - laneX| < 1 m) ...
      expect(b.max[0], `${type} inside its lane`).toBeLessThanOrEqual(half + 1e-6);
      // ... and fills it closely enough that the lane it blocks reads as blocked edge to edge.
      expect(b.max[0], `${type} fills its lane`).toBeGreaterThan(half - 0.3);
    }
    expect(visual.gap.max[0]).toBeCloseTo(GAP_SIZE.w / 2, 6);
    // A hopper standing in a free neighbouring lane (bot ~0.5 m wide) never overlaps a blocked lane's piece.
    for (const type of ["block", "bar", "wall"] as const) expect(laneX(1) - 0.25).toBeGreaterThan(visual[type].max[0]);
    expect(laneAt(visual.wall.max[0])).toBe(0);
  });

  it("hazard heights match the sim's clearances (block top, duck-bar underside, wall over a Big Jump)", () => {
    // Block: the crate's drawn top is the sim's block hitbox top.
    expect(visual.block.max[1]).toBeCloseTo(BLOCK_SIZE.h, 2);
    expect(CONFIG.BLOCK_CLEAR_Y).toBeCloseTo(visual.block.max[1], 2);
    // Bar: the plasma crossbar underside clears the ducking Idol bot (lean included) and stops a standing one.
    const barUnderside = meshBox(plasmaCrossbarParts().mesh.positions).min[1];
    expect(barUnderside).toBeCloseTo(BAR_SIZE.y - BAR_SIZE.h / 2 - 0.0, 1);
    const duck = botPoseScale("duck", 0);
    expect(duck.sy).toBe(IDOL_DUCK_SY);
    const halfDepth = 0.111 * IDOL_BOT_HEIGHT * duck.sz; // raw GLB depth (+X) ±0.111 m per metre of height
    const duckTop = IDOL_BOT_HEIGHT * duck.sy * Math.cos(DUCK_PITCH) + halfDepth * Math.sin(DUCK_PITCH);
    expect(duckTop, "ducking bot passes under the bar").toBeLessThan(barUnderside - 0.05);
    expect(IDOL_BOT_HEIGHT * botPoseScale("grounded", 0).sy, "standing bot hits the bar").toBeGreaterThan(barUnderside);
    // Wall: dodge-only; even a Big Jump's feet stay below its top, so the MISS for a blocked lane is what you see.
    expect(visual.wall.max[1]).toBeGreaterThan(CONFIG.BIG_JUMP_HEIGHT);
    expect(visual.wall.max[1]).toBeGreaterThanOrEqual(WALL_SIZE.h);
  });

  it("the sim hits a hopper whose feet are below the crate top and clears one above it", () => {
    const run = (hopBefore: number): { y: number; judgement: string | null } => {
      const sim = new BeatHopperSim(7);
      sim.advance({ ...IDLE, start: true });
      for (const s of sim.o.obstacles) s.active = false;
      for (const s of sim.o.orbSlots) s.active = false;
      sim.o.spawnedThroughBeat = 100000;
      const cross = 2;
      Object.assign(sim.o.obstacles[0]!, { active: true, type: "block", lanes: ALL_LANES, beat: 4, crossTime: cross, resolved: false, judgement: null });
      while (sim.o.t + CONFIG.DT <= cross - hopBefore + 1e-9) sim.advance(IDLE);
      sim.advance({ ...IDLE, hop: true });
      let y = 0;
      while (!sim.o.obstacles[0]!.resolved) { sim.advance(IDLE); y = sim.o.y; }
      return { y, judgement: sim.o.obstacles[0]!.judgement };
    };
    const low = run(0.08);
    expect(low.y).toBeLessThan(BLOCK_SIZE.h);
    expect(low.judgement).toBe("miss");
    const high = run(0.3);
    expect(high.y).toBeGreaterThanOrEqual(BLOCK_SIZE.h);
    expect(["perfect", "good"]).toContain(high.judgement);
  });
});
